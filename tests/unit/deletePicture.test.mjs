// Mock S3 client before importing handler
let mockSend
jest.mock('@aws-sdk/client-s3', () => {
  const original = jest.requireActual('@aws-sdk/client-s3')
  mockSend = jest.fn()
  return {
    ...original,
    S3Client: jest.fn(() => ({ send: mockSend }))
    // DeleteObjectCommand left as real class
  }
})

// Mock JWT
jest.mock('../../functions/utils/auth.mjs', () => ({
  verifyJwt: jest.fn()
}))

import { handler } from '../../functions/tracks/deletePicture.mjs'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { verifyJwt } from '../../functions/utils/auth.mjs'

describe('deletePicture handler', () => {
  beforeEach(() => {
    mockSend.mockReset()
    verifyJwt.mockReturnValue({ sub: 'testUser' })
  })

  it('returns 204 when delete succeeds', async () => {
    mockSend.mockResolvedValueOnce({})

    const event = { pathParameters: { trackId: 'track123', picIndex: '0' } }
    const context = {}

    const result = await handler(event, context)

    expect(result.statusCode).toBe(204)
    expect(result.body).toBeNull()
    expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand))
  })

  it('returns 404 when object not found', async () => {
    const error = new Error('NoSuchKey')
    error.name = 'NoSuchKey'
    mockSend.mockRejectedValueOnce(error)

    const event = { pathParameters: { trackId: 'track123', picIndex: '99' } }
    const context = {}

    const result = await handler(event, context)

    expect(result.statusCode).toBe(404)
    expect(JSON.parse(result.body).error).toBeDefined()
  })

  it('returns 500 on other errors', async () => {
    const error = new Error('Boom')
    mockSend.mockRejectedValueOnce(error)

    const event = { pathParameters: { trackId: 'track123', picIndex: '1' } }
    const context = {}

    const result = await handler(event, context)

    expect(result.statusCode).toBe(500)
    expect(JSON.parse(result.body).error).toBeDefined()
  })

  it('returns 401 when JWT invalid', async () => {
    verifyJwt.mockReturnValueOnce({ statusCode: 401 })

    const event = { pathParameters: { trackId: 'track123', picIndex: '0' } }
    const context = {}

    const result = await handler(event, context)

    expect(result.statusCode).toBe(401)
  })
})
