import jwt from 'jsonwebtoken'

// ------------------------------------------------------------
// AWS MOCKS — same pattern as createTrack
// ------------------------------------------------------------
jest.mock('@aws-sdk/client-s3', () => {
  const sendMock = jest.fn()
  class S3Client {
    send = sendMock
  }
  return {
    __esModule: true,
    S3Client,
    PutObjectCommand: jest.fn(),
    __sendMock: sendMock
  }
})

jest.mock('@aws-sdk/client-dynamodb', () => {
  const sendMock = jest.fn(async () => ({
    Item: {
      trackId: { S: 't1' },
      username: { S: 'userA' }
    }
  }))
  class DynamoDBClient {
    send = sendMock
  }
  return {
    __esModule: true,
    DynamoDBClient,
    GetItemCommand: jest.fn(),
    __sendMockDdb: sendMock
  }
})

// ------------------------------------------------------------
// Import mock handles + PutObjectCommand ONCE
// ------------------------------------------------------------
import { __sendMock as s3SendMock, PutObjectCommand } from '@aws-sdk/client-s3'
import { __sendMockDdb as ddbSendMock } from '@aws-sdk/client-dynamodb'

// Import handler AFTER mocks
import { handler } from '../../functions/tracks/addPicture.mjs'

let jwtSpy

describe('addPicture handler', () => {
  const base64jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')

  const authEvent = (overrides = {}) => ({
    headers: { Authorization: 'Bearer sometoken' },
    pathParameters: { trackId: 't1', picIndex: '0' },
    ...overrides
  })

  beforeEach(() => {
    jwtSpy = jest.spyOn(jwt, 'verify')
    jwtSpy.mockReturnValue({ sub: 'userA' }) // default happy path
    s3SendMock.mockReset()
    ddbSendMock.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ------------------------------------------------------------
  // JWT TESTS — same pattern as createTrack
  // ------------------------------------------------------------
  it('returns 401 when JWT is missing or invalid', async () => {
    jwtSpy.mockImplementation(() => { throw new Error('MissingToken') })

    const event = { headers: {}, body: base64jpeg, pathParameters: { trackId: 't1', picIndex: '0' } }
    const res = await handler(event)

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('MissingToken')
  })

  // ------------------------------------------------------------
  // PAYLOAD VALIDATION
  // ------------------------------------------------------------
  it('rejects payloads larger than 1MB', async () => {
    const bigBody = Buffer.alloc(1000001).toString('base64')
    const res = await handler(authEvent({ body: bigBody }))
    expect(res.statusCode).toBe(413)
  })

  it('rejects non-JPEG payloads', async () => {
    const pngBody = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
    const res = await handler(authEvent({ body: pngBody }))
    expect(res.statusCode).toBe(400)
  })

  // ------------------------------------------------------------
  // HAPPY PATH
  // ------------------------------------------------------------
  it('uploads valid JPEG when user owns the track', async () => {
    ddbSendMock.mockResolvedValue({
      Item: {
        trackId: { S: 't1' },
        username: { S: 'userA' }
      }
    })

    s3SendMock.mockResolvedValue({})

    const res = await handler(authEvent({ body: base64jpeg }))
    expect(res.statusCode).toBe(201)

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: process.env.BUCKET_NAME,
        Key: 't1/pictures/0.jpg',
        ContentType: 'image/jpeg'
      })
    )
  })

  // ------------------------------------------------------------
  // ERROR PATHS
  // ------------------------------------------------------------
  it('returns 404 if track does not exist', async () => {
    ddbSendMock.mockResolvedValue({ Item: undefined })

    const res = await handler(authEvent({ body: base64jpeg }))
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 if user does not own the track', async () => {
    ddbSendMock.mockResolvedValue({
      Item: {
        trackId: { S: 't1' },
        username: { S: 'otherUser' }
      }
    })

    const res = await handler(authEvent({ body: base64jpeg }))
    expect(res.statusCode).toBe(403)
  })

  it('returns 500 if S3 upload fails', async () => {
    ddbSendMock.mockResolvedValue({
      Item: {
        trackId: { S: 't1' },
        username: { S: 'userA' }
      }
    })

    s3SendMock.mockRejectedValue(new Error('boom'))

    const res = await handler(authEvent({ body: base64jpeg }))
    expect(res.statusCode).toBe(500)
  })
})
