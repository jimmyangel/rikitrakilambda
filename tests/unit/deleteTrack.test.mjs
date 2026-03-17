import { handler } from '../../functions/tracks/deleteTrack.mjs'
import { verifyJwt } from '../../functions/utils/auth.mjs'

// --- AWS MOCKS (MATCH ORIGINAL PATTERN) ------------------------------------

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}))

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const send = jest.fn()
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue({ send })
    },
    QueryCommand: jest.fn(),
    BatchWriteCommand: jest.fn(),
    __send: send
  }
})

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn()
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send })),
    ListObjectsV2Command: jest.fn(),
    DeleteObjectsCommand: jest.fn(),
    __send: send
  }
})

jest.mock('../../functions/utils/auth.mjs')

// Extract the send mocks
import * as ddbModule from '@aws-sdk/lib-dynamodb'
import * as s3Module from '@aws-sdk/client-s3'

const ddbSend = ddbModule.__send
const s3Send = s3Module.__send

// ---------------------------------------------------------------------------

describe('deleteTrack ownership validation', () => {

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 404 when metadata item does not exist', async () => {
    verifyJwt.mockReturnValue({ sub: 'alice' })

    // Metadata query returns no items
    ddbSend.mockResolvedValueOnce({ Items: [] })

    const event = { pathParameters: { trackId: 'T1' } }
    const resp = await handler(event)

    expect(resp.statusCode).toBe(404)
    expect(JSON.parse(resp.body).error).toBe('TrackNotFound')
  })

  test('returns 403 when track is owned by someone else', async () => {
    verifyJwt.mockReturnValue({ sub: 'alice' })

    ddbSend.mockResolvedValueOnce({
      Items: [{ PK: 'TRACK#T1', SK: 'METADATA', username: 'bob' }]
    })

    const event = { pathParameters: { trackId: 'T1' } }
    const resp = await handler(event)

    expect(resp.statusCode).toBe(403)
    expect(JSON.parse(resp.body).error).toBe('Forbidden')
  })

  test('returns 204 when user owns the track', async () => {
    verifyJwt.mockReturnValue({ sub: 'alice' })

    // 1. Metadata query
    ddbSend.mockResolvedValueOnce({
      Items: [{ PK: 'TRACK#T1', SK: 'METADATA', username: 'alice' }]
    })

    // 2. S3 list
    s3Send.mockResolvedValueOnce({ Contents: [] })

    // 3. DynamoDB delete batch
    ddbSend.mockResolvedValueOnce({ Items: [] })

    const event = { pathParameters: { trackId: 'T1' } }
    const resp = await handler(event)

    expect(resp.statusCode).toBe(204)
  })
})
