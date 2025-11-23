import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
//import { corsHeaders } from '../../utils/config.mjs'

const client = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(client)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET"
}

export const handler = async (event) => {
  try {
    const limit = event.queryStringParameters?.limit
      ? parseInt(event.queryStringParameters.limit, 10)
      : 5000

    const proj = event.queryStringParameters?.proj || "full"

    const command = new QueryCommand({
      TableName: "rikitrakidyn",
      IndexName: "TracksByDate",
      KeyConditionExpression: "tracksIndexPK = :pk",
      ExpressionAttributeValues: {
        ":pk": "TRACKS",
        ":false": false
      },
      FilterExpression: "attribute_not_exists(isDeleted) OR isDeleted = :false",
      ScanIndexForward: false
      // Limit: limit
    })

    const response = await docClient.send(command)

    let items = response.Items

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
    console.error("Error querying TracksByDate:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal server error" })
    }
  }
}



