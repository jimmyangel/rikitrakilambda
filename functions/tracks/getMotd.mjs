import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { corsHeaders, messages } from "../utils/config.mjs"
import  *  as logger from "../utils/logger.mjs"

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const MAX_MOTD = 5

export const handler = async (event, context) => {
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
    logger.error(messages.ERROR_MOTD_TRACKS, { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: messages.ERROR_MOTD_TRACKS })
    }
  }
}
