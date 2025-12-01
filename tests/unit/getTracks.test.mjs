import { handler } from '../../functions/tracks/getTracks.mjs'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { corsHeaders } from '../../functions/utils/config.mjs'
import * as logger from '../../functions/utils/logger.mjs'   // <-- import your logger

// Mock utils
jest.mock('../../functions/utils/queryPlanner.mjs', () => ({
  buildTracksQuery: jest.fn(() => ({ TableName: 'Tracks' }))
}))

jest.mock('../../functions/utils/applyFilters.mjs', () => ({
  applyFilters: jest.fn(items => items)
}))

describe('getTracks handler (prototype spy)', () => {
  beforeEach(() => {
    // Spy on the prototype send method
    jest.spyOn(DynamoDBDocumentClient.prototype, 'send').mockResolvedValue({
      Items: [
        { trackId: 't1', trackName: 'Track One', username: 'ricardo' },
        { trackId: 't2', trackName: 'Track Two', username: 'ricardo' }
      ]
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns tracks keyed by trackId', async () => {
    const event = { queryStringParameters: {} }
    const response = await handler(event)

    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual(corsHeaders)

    const body = JSON.parse(response.body)
    expect(body.tracks.t1.trackName).toBe('Track One')
    expect(body.tracks.t2.trackName).toBe('Track Two')
    expect(DynamoDBDocumentClient.prototype.send).toHaveBeenCalledWith(expect.any(QueryCommand))
  })

  it('applies "small" projection', async () => {
    const event = { queryStringParameters: { proj: 'small' } }
    const response = await handler(event)
    const body = JSON.parse(response.body)

    expect(body.tracks.t1).toHaveProperty('trackId')
    expect(body.tracks.t1).toHaveProperty('trackName')
    expect(body.tracks.t1).toHaveProperty('username') // stripped out
  })

  it('handles errors gracefully and logs', async () => {
    // Spy on logger.error instead of console.error
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    DynamoDBDocumentClient.prototype.send.mockRejectedValueOnce(new Error('DDB fail'))
    const fakeContext = { awsRequestId: 'test-req-123' }
    const event = { queryStringParameters: {} }
    const response = await handler(event, fakeContext)

    expect(response.statusCode).toBe(500)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Internal server error')

    // Verify logger.error was called with message, error object, and context
    expect(loggerSpy).toHaveBeenCalledWith(
      'Error querying Tracks',
      expect.objectContaining({
        err: expect.objectContaining({ message: 'DDB fail' })
      }),
      fakeContext
    )
  })
})
