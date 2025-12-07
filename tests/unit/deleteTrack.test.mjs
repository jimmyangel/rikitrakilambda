// __tests__/deleteTrack.test.mjs

// 1. Mock AWS SDK modules completely
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn()
  return {
    S3Client: jest.fn(() => ({ send: mockSend })),
    ListObjectsV2Command: jest.fn(),
    DeleteObjectsCommand: jest.fn(),
    __mockSend: mockSend // expose for test control
  }
})

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const mockSend = jest.fn()
  return {
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    QueryCommand: jest.fn(),
    BatchWriteCommand: jest.fn(),
    __mockSend: mockSend // expose for test control
  }
})

// 2. Mock utils
import { verifyJwt } from '../../functions/utils/auth.mjs'
import * as logger from '../../functions/utils/logger.mjs'
jest.mock('../../functions/utils/auth.mjs')
jest.mock('../../functions/utils/logger.mjs')

// 3. Import handler AFTER mocks
import { handler } from '../../functions/tracks/deleteTrack.mjs'

// 4. Grab exposed send mocks
import * as s3Module from '@aws-sdk/client-s3'
import * as ddbModule from '@aws-sdk/lib-dynamodb'
const mockS3Send = s3Module.__mockSend
const mockDdbSend = ddbModule.__mockSend

describe('deleteTrack handler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.BUCKET_NAME = 'rikitraki'
    process.env.TABLE_NAME = 'TracksTable'
    logger.error.mockImplementation(() => {})
  })

  it('returns 400 if trackId missing', async () => {
    const event = { pathParameters: {} }
    const res = await handler(event, {})
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('MissingTrackId')
  })

  it('returns JWT error if verifyJwt fails', async () => {
    verifyJwt.mockReturnValue({ statusCode: 401, body: 'Unauthorized' })
    const event = { pathParameters: { trackId: 'abc123' } }
    const res = await handler(event, {})
    expect(res.statusCode).toBe(401)
  })

  it('deletes S3 objects and DynamoDB items successfully', async () => {
    verifyJwt.mockReturnValue({ sub: 'ricardo' })

    mockS3Send
      .mockResolvedValueOnce({ Contents: [{ Key: 'abc123/gpx/file.gpx' }, { Key: 'abc123/thumbnails/0.jpg' }] }) // list
      .mockResolvedValueOnce({}) // delete

    mockDdbSend
      .mockResolvedValueOnce({ Items: [{ PK: 'TRACK#abc123', SK: 'METADATA' }, { PK: 'TRACK#abc123', SK: 'REGION#0#foo' }] }) // query
      .mockResolvedValueOnce({}) // batch write

    const event = { pathParameters: { trackId: 'abc123' } }
    const res = await handler(event, {})
    expect(res.statusCode).toBe(204)
    expect(res.body).toBeNull()
  })

  it('handles unexpected errors gracefully', async () => {
    verifyJwt.mockReturnValue({ sub: 'ricardo' })
    mockS3Send.mockRejectedValueOnce(new Error('boom'))

    const event = { pathParameters: { trackId: 'abc123' } }
    const res = await handler(event, {})
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toBe('DeleteTrackError')
    expect(logger.error).toHaveBeenCalled()
  })
})
