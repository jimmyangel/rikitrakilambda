import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { corsHeaders } from "../utils/config.mjs"
import { buildTracksQuery } from "../utils/queryPlanner.mjs"
import { applyFilters, hasExtraFilters } from "../utils/applyFilters.mjs"
import  *  as logger from "../utils/logger.mjs"

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event, context) => {
  try {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit, 10) : 5000
    const rawFilter = event.queryStringParameters?.filter
    const filter = rawFilter ? JSON.parse(decodeURIComponent(rawFilter)) : {}

    const baseQuery = buildTracksQuery(filter, limit)

    let numberOfTracks

    if (!hasExtraFilters(filter)) {
      // No client-side filters → let DynamoDB count directly
      const countQuery = { ...baseQuery, Select: "COUNT" }
      const result = await client.send(new QueryCommand(countQuery))
      numberOfTracks = result.Count || 0
    } else {
      // Client-side filters present → fetch items and count after filtering
      const result = await client.send(new QueryCommand(baseQuery))
      let items = result.Items || []
      items = applyFilters(items, filter)
      numberOfTracks = items.length
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ numberOfTracks })
    }
  } catch (err) {
    logger.error('Error querying Tracks', { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to count tracks" })
    }
  }
}

