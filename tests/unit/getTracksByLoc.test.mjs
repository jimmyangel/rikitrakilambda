import { handler } from '../../functions/tracks/getTracksByLoc.mjs'
import * as logger from '../../functions/utils/logger.mjs'
import { haversineKm } from '../../functions/utils/utils.mjs'

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

jest.mock('@aws-sdk/client-dynamodb')
jest.mock('@aws-sdk/lib-dynamodb')
jest.mock('../../functions/utils/utils.mjs')
jest.mock('../../functions/utils/logger.mjs')

const mockSend = jest.fn()

// Mock AWS SDK exactly as the handler uses it
DynamoDBClient.mockImplementation(() => ({}))
DynamoDBDocumentClient.from.mockReturnValue({ send: mockSend })
QueryCommand.mockImplementation((args) => ({ args }))

// Safe haversine mock — NEVER throws
haversineKm.mockImplementation((lat1, lon1, lat2, lon2) => {
  if (!Number.isFinite(lat2) || !Number.isFinite(lon2)) return Infinity

  return Math.sqrt(
    Math.pow(lat1 - lat2, 2) +
    Math.pow(lon1 - lon2, 2)
  ) * 100
})

const makeTrack = (id, lat, lon, username = 'u') => ({
  trackId: id,
  trackLatLng: [lat, lon],
  username,
  createdDate: '2024-01-01',
  trackType: 'Hiking',
  trackLevel: 'Easy',
  trackFav: false,
  trackName: `Track ${id}`,
  trackRegionTags: []
})

describe('getTracksByLoc Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns nearest 10 tracks globally when fewer than 10 are within 500 km', async () => {
    const center = { lat: -35, lon: -64 }

    const tracks = []
    for (let i = 0; i < 20; i++) {
      tracks.push(makeTrack(`t${i}`, -10 - i, -40 - i))
    }

    mockSend.mockResolvedValue({ Items: tracks })

    const event = {
      queryStringParameters: {
        lat: center.lat,
        lon: center.lon
      }
    }

    const res = await handler(event, {})
    const body = JSON.parse(res.body)

    expect(body.count).toBe(10)
    expect(body.radiusKm).toBe(body.tracks[9].distKm)
  })

  test('returns up to 200 tracks within 500 km when enough exist', async () => {
    const center = { lat: 0, lon: 0 }

    const tracks = []
    for (let i = 0; i < 300; i++) {
      tracks.push(makeTrack(`t${i}`, 0, 0))
    }

    mockSend.mockResolvedValue({ Items: tracks })

    const event = {
      queryStringParameters: {
        lat: center.lat,
        lon: center.lon
      }
    }

    const res = await handler(event, {})
    const body = JSON.parse(res.body)

    expect(body.count).toBe(200)
    expect(body.radiusKm).toBe(10)
  })

  test('username mode filters tracks and applies same logic', async () => {
    const center = { lat: -35, lon: -64 }

    const tracks = [
      makeTrack('a', -35, -64, 'jimmyangel'),
      makeTrack('b', -36, -65, 'jimmyangel'),
      makeTrack('c', -37, -66, 'jimmyangel'),
      makeTrack('d', -38, -67, 'jimmyangel'),
      makeTrack('e', -39, -68, 'jimmyangel'),
      makeTrack('f', -40, -69, 'jimmyangel'),
      makeTrack('g', -41, -70, 'jimmyangel'),
      makeTrack('h', -42, -71, 'jimmyangel')
    ]

    mockSend.mockResolvedValue({ Items: tracks })

    const event = {
      queryStringParameters: {
        lat: center.lat,
        lon: center.lon,
        username: 'jimmyangel'
      }
    }

    const res = await handler(event, {})
    const body = JSON.parse(res.body)

    expect(body.count).toBe(8)
    expect(body.radiusKm).toBe(body.tracks[7].distKm)
  })

  test('returns empty result when no tracks exist', async () => {
    mockSend.mockResolvedValue({ Items: [] })

    const event = {
      queryStringParameters: {
        lat: 10,
        lon: 10
      }
    }

    const res = await handler(event, {})
    const body = JSON.parse(res.body)

    expect(body.count).toBe(0)
    expect(body.radiusKm).toBe(0)
  })
})
