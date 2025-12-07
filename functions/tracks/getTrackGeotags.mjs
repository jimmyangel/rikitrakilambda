import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { corsHeaders, messages } from "../utils/config.mjs"
import * as logger from "../utils/logger.mjs"

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

    // Fetch METADATA item for this track
    const result = await ddb.send(new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `TRACK#${trackId}`, SK: "METADATA" }
    }))

    const metadata = result.Item
    if (!metadata || !Array.isArray(metadata.trackPhotos) || metadata.trackPhotos.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: messages.WARN_NO_PHOTOS_FOR_TRACK })
      }
    }

    // Build trackPhotos array with S3 blobs
    const trackPhotos = await Promise.all(
      metadata.trackPhotos.map(async (p, idx) => {
        const { picCaption, picLatLng, picName, picThumb } = p

        // Thumbnail key always matches array position
        const s3Key = `${trackId}/thumbnails/${idx}.jpg`

        let blob
        try {
          const s3Resp = await s3.send(new GetObjectCommand({
            Bucket: "rikitraki",
            Key: s3Key
          }))
          blob = await streamToBase64(s3Resp.Body)
        } catch {
          blob = null // gracefully handle missing thumbnail
        }

        return {
          picName,
          picThumb,
          picCaption,
          picLatLng,
          picThumbBlob: blob,
          ...(p.picIndex !== undefined && { picIndex: p.picIndex })
        }
      })
    )

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        geoTags: {
          trackId,
          trackPhotos
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
