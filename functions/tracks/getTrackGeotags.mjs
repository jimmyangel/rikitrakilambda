import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { corsHeaders, messages } from "../utils/config.mjs"
import  *  as logger from "../utils/logger.mjs"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})

export const handler = async (event, context) => {
  try {
    const trackId = event.pathParameters?.trackId
    if (!trackId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing trackId" })
      }
    }

    // Query DynamoDB for all photo items for this track
    const result = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skprefix)",
      ExpressionAttributeValues: {
        ":pk": `TRACK#${trackId}`,
        ":skprefix": "PHOTO#"
      }
    }))

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: messages.WARN_NO_PHOTOS_FOR_TRACK })
      }
    }

    // Build trackPhotos array
    const trackPhotos = await Promise.all(
      result.Items.map(async (item) => {
        const { photoIndex, picCaption, picLatLng, picIndex, picName, picThumb } = item

        // Fetch thumbnail blob from S3
        const s3Key = `${trackId}/thumbnails/${photoIndex}.jpg`
        const s3Resp = await s3.send(new GetObjectCommand({
          Bucket: "rikitraki",
          Key: s3Key
        }))
        const blob = await streamToBase64(s3Resp.Body)

        return {
          picName: picName,
          picThumb: picThumb,
          picCaption: picCaption,
          picLatLng: picLatLng,
          picIndex: picIndex,
          picThumbBlob: blob
        }
      })
    )

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        geoTags: {
          trackId: trackId,
          trackPhotos: trackPhotos
        }
      })
    }
  } catch (err) {
    logger.error(messages.ERROR_FETCH_GEOTAGS, { err: { message: err.message } }, context)    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: messages.ERROR_FETCH_GEOTAGS })
    }
  }
}

// Helper: convert S3 stream to base64
const streamToBase64 = async (stream) => {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("base64")
}
