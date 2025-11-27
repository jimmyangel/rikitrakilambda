// __tests__/getTracks.test.js
import { handler } from '../../functions/tracks/getTracks.mjs'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { corsHeaders } from '../../functions/utils/config.mjs'
import { buildTracksQuery } from '../../functions/utils/queryPlanner.mjs'
import { applyFilters } from '../../functions/utils/applyFilters.mjs'

// Mock dependencies
jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb')
  return {
    ...actual,
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: jest.fn() })) },
    QueryCommand: jest.fn()
  }
})

jest.mock('../../functions/utils/queryPlanner.mjs', () => ({
  buildTracksQuery: jest.fn()
}))

jest.mock('../../functions/utils/applyFilters.mjs', () => ({
  applyFilters: jest.fn(items => items)
}))

describe('getTracks handler', () => {
  let mockSend

  beforeEach(() => {
    mockSend = jest.fn().mockResolvedValue({
      Items: [
        { trackId: 't1', trackName: 'Track One', username: 'ricardo' },
        { trackId: 't2', trackName: 'Track Two', username: 'ricardo' }
      ]
    })
    DynamoDBDocumentClient.from.mockReturnValue({ send: mockSend })
    buildTracksQuery.mockReturnValue({ TableName: 'Tracks', KeyConditionExpression: '...' })
  })

  it('returns tracks keyed by trackId', async () => {
    const event = { queryStringParameters: {} }
    const response = await handler(event)

    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual(corsHeaders)

    const body = JSON.parse(response.body)
    expect(body.tracks.t1.trackName).toBe('Track One')
    expect(body.tracks.t2.trackName).toBe('Track Two')
    expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand))
  })

  it('applies "small" projection', async () => {
    const event = { queryStringParameters: { proj: 'small' } }
    const response = await handler(event)
    const body = JSON.parse(response.body)

    // Only curated fields should be present
    expect(body.tracks.t1).toHaveProperty('trackId')
    expect(body.tracks.t1).toHaveProperty('trackName')
    expect(body.tracks.t1).not.toHaveProperty('someOtherField')
  })

  it('handles errors gracefully', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB fail'))
    const event = { queryStringParameters: {} }
    const response = await handler(event)

    expect(response.statusCode).toBe(500)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Internal server error')
  })
})
