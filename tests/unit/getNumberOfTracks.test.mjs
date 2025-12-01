import { handler } from '../../functions/tracks/getNumberOfTracks.mjs'
import * as logger from '../../functions/utils/logger.mjs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { messages } from "../../functions/utils/config.mjs"

describe('getNumberOfTracks handler', () => {
  let sendSpy
  let loggerSpy

  beforeEach(() => {
    sendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns 200 with count when no extra filters', async () => {
    // Happy path: DynamoDB returns a count
    sendSpy.mockResolvedValueOnce({ Count: 3 })

    const event = { queryStringParameters: {} }
    const response = await handler(event)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ numberOfTracks: 3 })
  })

  it('returns 500 and logs error when DynamoDB throws', async () => {
    // Error path: DynamoDB throws
    sendSpy.mockRejectedValueOnce(new Error('Simulated DynamoDB failure'))

    const event = { queryStringParameters: {} }
    const fakeContext = { awsRequestId: 'test-req-123' }
    const response = await handler(event, fakeContext)

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({ error: messages.ERROR_TRACKS_QUERY })

    expect(logger.error).toHaveBeenCalledWith(
        'Error querying Tracks',
        expect.objectContaining({
            err: expect.objectContaining({ message: 'Simulated DynamoDB failure' })
        }),
        fakeContext
    )
  })
})


