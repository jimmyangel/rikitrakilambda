import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { corsHeaders, messages } from "../utils/config.mjs"
import { buildTracksQuery } from '../utils/queryPlanner.mjs'
import { applyFilters } from "../utils/applyFilters.mjs"
import  *  as logger from "../utils/logger.mjs"

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event, context) => {
  try {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit, 10): 5000
    const rawFilter = event.queryStringParameters?.filter
    const filter = rawFilter ? JSON.parse(decodeURIComponent(rawFilter)) : {}
    const proj = event.queryStringParameters?.proj // 'small' or undefined

    const request = buildTracksQuery(filter, limit)
    const result = await client.send(new QueryCommand(request))

    let items = result.Items || []

      // Apply client-side filters (AND/OR, mapping, activity, country/region)
    items = applyFilters(items, filter)

    if (proj === "small") {
      // Curated response: only return a subset of fields
      items = items.map(item => ({
        trackId: item.trackId,
        trackLatLng: item.trackLatLng,
        createdDate: item.createdDate,
        username: item.username,
        trackType: item.trackType,
        trackLevel: item.trackLevel,
        trackFav: item.trackFav,
        trackName: item.trackName,
        trackRegionTags: item.trackRegionTags
      }))
    }

    // Convert array → object keyed by trackId
    let tracksById = items.reduce((acc, item) => {
      acc[item.trackId] = item
      return acc
    }, {})

    // Wrap it in an object (for API compatibility)
    tracksById = {tracks: tracksById}

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(tracksById)
    };

  } catch (err) {
    logger.error(messages.ERROR_TRACKS_QUERY, { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: messages.ERROR_TRACKS_QUERY })
    }
  }
}



