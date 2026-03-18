import jwt from 'jsonwebtoken'

// ------------------------------------------------------------
// AWS MOCKS — consistent with createTrack
// ------------------------------------------------------------
let mockS3Send
jest.mock('@aws-sdk/client-s3', () => {
  const original = jest.requireActual('@aws-sdk/client-s3')
  mockS3Send = jest.fn()

  return {
    __esModule: true,
    ...original,
    S3Client: jest.fn(() => ({ send: mockS3Send }))
  }
})

let mockDdbSend
jest.mock('@aws-sdk/client-dynamodb', () => {
  const original = jest.requireActual('@aws-sdk/client-dynamodb')

  // Default: valid track owned by testUser
  mockDdbSend = jest.fn(async () => ({
    Item: {
      trackId: { S: 'track123' },
      username: { S: 'testUser' }
    }
  }))

  return {
    __esModule: true,
    ...original,
    DynamoDBClient: jest.fn(() => ({ send: mockDdbSend }))
  }
})

// ------------------------------------------------------------
// JWT MOCK — same pattern as createTrack
// ------------------------------------------------------------
jest.mock('../../functions/utils/auth.mjs', () => ({
  verifyJwt: jest.fn()
}))

// Import AFTER mocks
import { handler } from '../../functions/tracks/deletePicture.mjs'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { verifyJwt } from '../../functions/utils/auth.mjs'

describe('deletePicture handler', () => {
  beforeEach(() => {
    mockS3Send.mockReset()
    mockDdbSend.mockReset()

    // Reset DynamoDB to default valid track
    mockDdbSend.mockResolvedValue({
      Item: {
        trackId: { S: 'track123' },
        username: { S: 'testUser' }
      }
    })

    verifyJwt.mockReturnValue({ sub: 'testUser' })
  })

  // ------------------------------------------------------------
  // JWT TEST
  // ------------------------------------------------------------
  it('returns 401 when JWT invalid', async () => {
    verifyJwt.mockReturnValueOnce({ statusCode: 401 })

    const event = { pathParameters: { trackId: 'track123', picIndex: '0' } }
    const result = await handler(event, {})

    expect(result.statusCode).toBe(401)
  })

  // ------------------------------------------------------------
  // TRACK NOT FOUND
  // ------------------------------------------------------------
  it('returns 404 when track does not exist', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined })

    const event = { pathParameters: { trackId: 'missing', picIndex: '0' } }
    const result = await handler(event, {})

    expect(result.statusCode).toBe(404)
  })

  // ------------------------------------------------------------
  // OWNERSHIP CHECK
  // ------------------------------------------------------------
  it('returns 403 when user does not own the track', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: {
        trackId: { S: 'track123' },
        username: { S: 'otherUser' }
      }
    })

    const event = { pathParameters: { trackId: 'track123', picIndex: '0' } }
    const result = await handler(event, {})

    expect(result.statusCode).toBe(403)
  })

  // ------------------------------------------------------------
  // HAPPY PATH
  // ------------------------------------------------------------
  it('returns 204 when delete succeeds', async () => {
    mockS3Send.mockResolvedValueOnce({})

    const event = { pathParameters: { trackId: 'track123', picIndex: '0' } }
    const result = await handler(event, {})

    expect(result.statusCode).toBe(204)
    expect(result.body).toBeNull()
    expect(mockS3Send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand))
  })

  // ------------------------------------------------------------
  // S3 NoSuchKey — NOW RETURNS 204 (idempotent delete)
  // ------------------------------------------------------------
  it('returns 204 when S3 reports NoSuchKey (idempotent delete)', async () => {
    const err = new Error('NoSuchKey')
    err.name = 'NoSuchKey'
    mockS3Send.mockRejectedValueOnce(err)

    const event = { pathParameters: { trackId: 'track123', picIndex: '99' } }
    const result = await handler(event, {})

    expect(result.statusCode).toBe(204)
    expect(result.body).toBeNull()
  })

  // ------------------------------------------------------------
  // S3 OTHER ERROR
  // ------------------------------------------------------------
  it('returns 500 on other S3 errors', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('Boom'))

    const event = { pathParameters: { trackId: 'track123', picIndex: '1' } }
    const result = await handler(event, {})

    expect(result.statusCode).toBe(500)
  })
})
