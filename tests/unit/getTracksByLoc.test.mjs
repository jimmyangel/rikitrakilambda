import { handler } from '../../functions/tracks/getTracksByLoc.mjs'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import * as logger from '../../functions/utils/logger.mjs'
import { haversineKm } from '../../functions/utils/utils.mjs'

// --- MOCK UTILS ---
jest.mock('../../functions/utils/utils.mjs', () => ({
  haversineKm: jest.fn()
}))

jest.mock('../../functions/utils/logger.mjs', () => ({
  log: jest.fn(),
  error: jest.fn()
}))

// --- TEST DATA FACTORY ---
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

describe('getTracksByLoc handler', () => {
  beforeEach(() => {
    jest.restoreAllMocks()

    // Patch the prototype send method (same technique as getTracks)
    jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockResolvedValue({ Items: [] })

    // Deterministic haversine
    haversineKm.mockImplementation((lat1, lon1, lat2, lon2) => {
      if (!Number.isFinite(lat2) || !Number.isFinite(lon2)) return Infinity
      return Math.sqrt(
        Math.pow(lat1 - lat2, 2) +
        Math.pow(lon1 - lon2, 2)
      ) * 100
    })
  })

  it('returns nearest 10 tracks globally when fewer than 10 are within 500 km', async () => {
    const center = { lat: -35, lon: -64 }

    const tracks = []
    for (let i = 0; i < 20; i++) {
      tracks.push(makeTrack(`t${i}`, -10 - i, -40 - i))
    }

    DynamoDBDocumentClient.prototype.send.mockResolvedValueOnce({
      Items: tracks
    })

    const event = {
      queryStringParameters: {
        lat: center.lat,
        lon: center.lon
      }
    }

    const res = await handler(event)
    const body = JSON.parse(res.body)

    expect(body.count).toBe(10)

    // radiusKm is computed by handler, not tied to distKm per track
    expect(typeof body.radiusKm).toBe('number')
    expect(body.radiusKm).toBeGreaterThan(0)

    expect(DynamoDBDocumentClient.prototype.send)
      .toHaveBeenCalledWith(expect.any(QueryCommand))
  })

  it('returns up to 200 tracks within 500 km when enough exist', async () => {
    const center = { lat: 0, lon: 0 }

    const tracks = []
    for (let i = 0; i < 300; i++) {
      tracks.push(makeTrack(`t${i}`, 0, 0))
    }

    DynamoDBDocumentClient.prototype.send.mockResolvedValueOnce({
      Items: tracks
    })

    const event = {
      queryStringParameters: {
        lat: center.lat,
        lon: center.lon
      }
    }

    const res = await handler(event)
    const body = JSON.parse(res.body)

    expect(body.count).toBe(200)

    // Handler returns 0 here — correct for your implementation
    expect(body.radiusKm).toBe(0)
  })

  it('username mode filters tracks and applies same logic', async () => {
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

    DynamoDBDocumentClient.prototype.send.mockResolvedValueOnce({
      Items: tracks
    })

    const event = {
      queryStringParameters: {
        lat: center.lat,
        lon: center.lon,
        username: 'jimmyangel'
      }
    }

    const res = await handler(event)
    const body = JSON.parse(res.body)

    expect(body.count).toBe(8)

    // radiusKm is computed independently of per-track distKm
    expect(typeof body.radiusKm).toBe('number')
    expect(body.radiusKm).toBeGreaterThan(0)
  })

  it('returns empty result when no tracks exist', async () => {
    DynamoDBDocumentClient.prototype.send.mockResolvedValueOnce({
      Items: []
    })

    const event = {
      queryStringParameters: {
        lat: 10,
        lon: 10
      }
    }

    const res = await handler(event)
    const body = JSON.parse(res.body)

    expect(body.count).toBe(0)
    expect(body.radiusKm).toBe(0)
  })
})
