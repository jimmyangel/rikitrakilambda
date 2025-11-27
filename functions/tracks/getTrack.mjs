import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb"
import { corsHeaders } from "../utils/config.mjs"

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event) => {
  try {
    const trackId = event.pathParameters?.trackId
    if (!trackId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing trackId" })
      }
    }

    const result = await client.send(new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: {
        PK: `TRACK#${trackId}`,
        SK: "METADATA"
      }
    }))

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Track not found" })
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.Item)
    }
  } catch (err) {
    console.error("Error in getTrack:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal Server Error" })
    }
  }
}

