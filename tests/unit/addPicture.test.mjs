import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Default mock: resolves successfully
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn()
}))

// Import handler once for the happy‑path tests
import { handler } from '../../functions/tracks/addPicture.mjs'

describe('picture handler (happy path)', () => {
  const base64jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')

  it('rejects payloads larger than 1MB', async () => {
    const bigBody = Buffer.alloc(1000001).toString('base64')
    const event = { pathParameters: { trackId: 't1', picIndex: '0' }, body: bigBody }
    const res = await handler(event)
    expect(res.statusCode).toBe(413)
    const parsed = JSON.parse(res.body)
    expect(parsed.error).toBe('Payload too large')
  })

  it('rejects non-JPEG payloads', async () => {
    const pngBody = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
    const event = { pathParameters: { trackId: 't1', picIndex: '0' }, body: pngBody }
    const res = await handler(event)
    expect(res.statusCode).toBe(400)
    const parsed = JSON.parse(res.body)
    expect(parsed.error).toBe('Invalid input')
  })

  it('uploads valid JPEG to S3', async () => {
    const event = { pathParameters: { trackId: 't1', picIndex: '0' }, body: base64jpeg }
    const res = await handler(event)
    expect(res.statusCode).toBe(201)
    const parsed = JSON.parse(res.body)
    expect(parsed.trackId).toBe('t1')
    expect(parsed.picIndex).toBe('0')
    expect(S3Client).toHaveBeenCalled()
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: process.env.BUCKET_NAME,
        Key: 't1/pictures/0.jpg',
        ContentType: 'image/jpeg'
      })
    )
  })
})

describe('picture handler (error path)', () => {
  const base64jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')

  it('handles S3 errors gracefully', async () => {
    // Override the mock to reject
    jest.doMock('@aws-sdk/client-s3', () => ({
      S3Client: jest.fn(() => ({ send: jest.fn().mockRejectedValue(new Error('boom')) })),
      PutObjectCommand: jest.fn()
    }))

    // Reset modules so the handler re‑creates its s3 instance with the new mock
    jest.resetModules()
    const { handler: freshHandler } = await import('../../functions/tracks/addPicture.mjs')

    const event = { pathParameters: { trackId: 't1', picIndex: '0' }, body: base64jpeg }
    const res = await freshHandler(event)
    expect(res.statusCode).toBe(507)
    const parsed = JSON.parse(res.body)
    expect(parsed.error).toBe('S3 error')
  })
})
