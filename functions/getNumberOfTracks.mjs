import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { corsHeaders } from "./utils/config.mjs"

const client = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(client)

export const handler = async (event) => {
  try {
    const params = event.queryStringParameters || {}
    const limit = event.queryStringParameters?.limit
      ? parseInt(event.queryStringParameters.limit, 10)
      : 5000

    // Base query against TracksByDate index
    const command = new QueryCommand({
        TableName: "rikitrakidyn",
        IndexName: "TracksByDate",
        KeyConditionExpression: "tracksIndexPK = :pk",
        ExpressionAttributeValues: {
            ":pk": "TRACKS",
            ":false": false
        },
        FilterExpression: "attribute_not_exists(isDeleted) OR isDeleted = :false",
        ScanIndexForward: false,
        Select: 'COUNT'
      // Limit: limit
    })

    const response = await docClient.send(command)

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ numberOfTracks: response.Count })
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
