import { handler } from '../../functions/tracks/getTrack.mjs'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { corsHeaders, messages } from '../../functions/utils/config.mjs'
import * as logger from '../../functions/utils/logger.mjs'

describe('getTrack handler', () => {
  let sendSpy
  let loggerSpy

  beforeEach(() => {
    sendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns 400 when trackId is missing', async () => {
    const event = { pathParameters: {} }
    const response = await handler(event)

    expect(response.statusCode).toBe(400)
    expect(response.headers).toEqual(corsHeaders)
    expect(JSON.parse(response.body)).toEqual({ error: 'Missing trackId' })
  })

  it('returns 404 when track not found', async () => {
    sendSpy.mockResolvedValueOnce({ Item: undefined })
    const event = { pathParameters: { trackId: 't1' } }
    const response = await handler(event)

    expect(response.statusCode).toBe(404)
    expect(response.headers).toEqual(corsHeaders)
    expect(JSON.parse(response.body)).toEqual({ error: 'Track not found' })
    expect(sendSpy).toHaveBeenCalledWith(expect.any(GetCommand))
  })

  it('returns 200 with track when found', async () => {
    const item = { trackId: 't1', trackName: 'Track One' }
    sendSpy.mockResolvedValueOnce({ Item: item })
    const event = { pathParameters: { trackId: 't1' } }
    const response = await handler(event)

    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual(corsHeaders)
    expect(JSON.parse(response.body)).toEqual(item)
    expect(sendSpy).toHaveBeenCalledWith(expect.any(GetCommand))
  })

  it('returns 500 and logs error when DynamoDB throws', async () => {
    sendSpy.mockRejectedValueOnce(new Error('Simulated DynamoDB failure'))
    const fakeContext = { awsRequestId: 'test-req-123' }
    const event = { pathParameters: { trackId: 't1' } }
    const response = await handler(event, fakeContext)

    expect(response.statusCode).toBe(500)
    expect(response.headers).toEqual(corsHeaders)
    expect(JSON.parse(response.body)).toEqual({ error: messages.ERROR_TRACKS_QUERY })

    expect(logger.error).toHaveBeenCalledWith(
      messages.ERROR_TRACKS_QUERY,
      expect.objectContaining({
        err: expect.objectContaining({ message: 'Simulated DynamoDB failure' })
      }),
      fakeContext
    )
  })
})
