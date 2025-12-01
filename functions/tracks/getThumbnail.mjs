import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { corsHeaders } from "../utils/config.mjs"
import  *  as logger from "../utils/logger.mjs"

const s3 = new S3Client({})

export const handler = async (event, context) => {
  try {
    const { trackId, picIndex } = event.pathParameters
    const bucket = process.env.BUCKET_NAME
    const key = `${trackId}/thumbnails/${picIndex}.jpg`

    const result = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key
    }))

    // Collect stream into buffer
    const chunks = []
    for await (const chunk of result.Body) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400", // cache for 1 day
        "ETag": result.ETag,
        "Last-Modified": result.LastModified?.toUTCString()
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true
    }

  } catch (err) {
    logger.error('Error fetching thumbnail', { err: { message: err.message } }, context)
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Thumbnail not found" })
    }
  }
}
