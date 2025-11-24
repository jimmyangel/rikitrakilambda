import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { corsHeaders } from "./utils/config.mjs"
import { buildTracksQuery } from './utils/queryPlanner.mjs'

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event) => {
  try {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit, 10): 5000
    const rawFilter = event.queryStringParameters?.filter

    const filter = rawFilter ? JSON.parse(decodeURIComponent(rawFilter)) : {}

    const request = buildTracksQuery(filter, 'count', limit)
    const result = await client.send(new QueryCommand(request))

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ numberOfTracks: result.Count })
    }
  } catch (err) {
    console.error(err)
    return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to count tracks' })
    }
  }
}
