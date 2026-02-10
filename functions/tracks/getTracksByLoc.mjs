import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { corsHeaders, messages } from '../utils/config.mjs'
import * as logger from '../utils/logger.mjs'
import geohash from 'ngeohash'
import { haversineKm } from '../utils/utils.mjs'

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const MAX_TRACKS_TARGET = 200
const MIN_TRACKS_TARGET = 10
const MAX_RADIUS_KM = 500

const projectSmall = item => ({
  trackId: item.trackId,
  trackLatLng: item.trackLatLng,
  createdDate: item.createdDate,
  username: item.username,
  trackType: item.trackType,
  trackLevel: item.trackLevel,
  trackFav: item.trackFav,
  trackName: item.trackName,
  trackRegionTags: item.trackRegionTags
})

const parseNumber = (value, fallback) => {
  if (value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const queryTracksByUser = async (username) => {
  const request = {
    TableName: 'rikitrakidyn',
    IndexName: 'TracksByUser',
    KeyConditionExpression: 'tracksIndexUserPK = :pk',
    ExpressionAttributeValues: {
      ':pk': `TRACKS#${username}`
    }
  }

  const result = await client.send(new QueryCommand(request))
  return result.Items || []
}

const queryTracksByGeoHashPrefixes = async (prefixes) => {
  if (prefixes === null) {
    const request = {
      TableName: 'rikitrakidyn',
      IndexName: 'TracksByGeoHash',
      KeyConditionExpression: 'tracksIndexPK = :pk',
      ExpressionAttributeValues: {
        ':pk': 'TRACKS'
      }
    }

    const result = await client.send(new QueryCommand(request))
    return result.Items || []
  }

  const all = []
  const seen = new Set()

  for (const prefix of prefixes) {
    const request = {
      TableName: 'rikitrakidyn',
      IndexName: 'TracksByGeoHash',
      KeyConditionExpression: 'tracksIndexPK = :pk AND begins_with(trackGeoHash, :gh)',
      ExpressionAttributeValues: {
        ':pk': 'TRACKS',
        ':gh': prefix
      }
    }

    const result = await client.send(new QueryCommand(request))
    const items = result.Items || []

    for (const item of items) {
      const id = item.trackId
      if (!id || seen.has(id)) continue
      seen.add(id)
      all.push(item)
    }
  }

  return all
}

const buildGeoHashPrefixes = (lat, lon, precision) => {
  if (precision === 0) return null
  const center = geohash.encode(lat, lon, precision)
  const neighbors = geohash.neighbors(center)
  return [center, ...neighbors]
}

const attachDistances = (items, lat, lon) => {
  return items.map(item => {
    const [tLat, tLon] = item.trackLatLng || []
    const distKm = haversineKm(lat, lon, tLat, tLon)
    return { ...item, distKm }
  })
}

export const handler = async (event, context) => {
  try {
    const qs = event.queryStringParameters || {}

    const lat = parseNumber(qs.lat, null)
    const lon = parseNumber(qs.lon, null)

    if (lat == null || lon == null) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'lat and lon are required' })
      }
    }

    const username = qs.username || null
    let candidates = []

    if (username) {
      // USERNAME MODE — fetch all tracks for that user
      candidates = await queryTracksByUser(username)
    } else {
      // GLOBAL MODE — geohash candidate fetch
      const all = []
      const seen = new Set()

      for (let precision = 4; precision >= 0; precision--) {
        const prefixes = buildGeoHashPrefixes(lat, lon, precision)
        const items = await queryTracksByGeoHashPrefixes(prefixes)

        for (const item of items) {
          const id = item.trackId
          if (!id || seen.has(id)) continue
          seen.add(id)
          all.push(item)
        }
      }

      candidates = all
    }

    if (!candidates.length) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          center: { lat, lon },
          radiusKm: 0,
          count: 0,
          tracks: []
        })
      }
    }

    // Compute distances
    const withDist = attachDistances(candidates, lat, lon)
    const valid = withDist.filter(t => Number.isFinite(t.distKm))

    if (!valid.length) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          center: { lat, lon },
          radiusKm: 0,
          count: 0,
          tracks: []
        })
      }
    }

    // Sort by distance
    const sorted = [...valid].sort((a, b) => a.distKm - b.distKm)

    // Partition
    const withinMaxRadius = sorted.filter(t => t.distKm <= MAX_RADIUS_KM)

    let selected = []

    if (withinMaxRadius.length >= MIN_TRACKS_TARGET) {
      selected = withinMaxRadius.slice(0, MAX_TRACKS_TARGET)
    } else {
      selected = sorted.slice(0, MIN_TRACKS_TARGET)
    }

    const radiusKm = selected.length
      ? selected[selected.length - 1].distKm
      : 0

    const small = selected.map(projectSmall)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        center: { lat, lon },
        radiusKm,
        count: small.length,
        tracks: small
      })
    }

  } catch (err) {
    logger.error(messages.ERROR_TRACKS_QUERY, { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: messages.ERROR_TRACKS_QUERY })
    }
  }
}
