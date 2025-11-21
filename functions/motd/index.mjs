import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const MAX_MOTD = 5

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET"
}

export const handler = async (event) => {
  try {
    let motdTracks = []
    let lastEvaluatedKey = undefined

    do {
      const result = await dynamo.send(new QueryCommand({
        TableName: "rikitrakidyn",
        IndexName: "TracksByDate",
        KeyConditionExpression: "tracksIndexPK = :pk",
        ExpressionAttributeValues: {
          ":pk": "TRACKS"
        },
        ScanIndexForward: false, // newest first
        Limit: 50,
        ExclusiveStartKey: lastEvaluatedKey
      }))

      const filtered = (result.Items ?? []).filter(t =>
        t.hasPhotos === true &&
        t.trackDescription &&
        t.trackDescription.length >= 20
      )

      motdTracks = motdTracks.concat(filtered)
      lastEvaluatedKey = result.LastEvaluatedKey

    } while (motdTracks.length < MAX_MOTD && lastEvaluatedKey)

    motdTracks = motdTracks.slice(0, MAX_MOTD)

    const motdArray = motdTracks.map(t => [
      t.trackId,
      0,           // always 0 for now
      t.trackName  // return trackName
    ])

    const responseBody = { motd: { motdTracks: motdArray } }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseBody)
    }

  } catch (err) {
    console.error("Error querying MOTD tracks:", err)

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Internal Server Error" })
    }
  }
}
