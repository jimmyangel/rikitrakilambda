import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { corsHeaders } from "./utils/config.mjs"

const s3 = new S3Client({})

export const handler = async (event) => {
  try {
    const { trackId } = event.pathParameters
    const bucket = process.env.BUCKET_NAME
    const prefix = `${trackId}/gpx`

    // List objects under the prefix, limit to 1
    const listResp = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1
    }))

    if (!listResp.Contents || listResp.Contents.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "GPX file not found" })
      }
    }

    const key = listResp.Contents[0].Key

    // Fetch the GPX file
    const getResp = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key
    }))

    // Collect stream into buffer
    const chunks = []
    for await (const chunk of getResp.Body) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/gpx+xml",
        "Cache-Control": "public, max-age=86400", // cache for 1 day
        "ETag": getResp.ETag,
        "Last-Modified": getResp.LastModified?.toUTCString()
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true
    }

  } catch (err) {
    console.error("Error fetching GPX:", err)
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: "GPX file not found" })
    }
  }
}
