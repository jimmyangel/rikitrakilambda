import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import * as logger from '../utils/logger.mjs'
import { corsHeaders, messages } from '../utils/config.mjs'

const s3 = new S3Client({})

// Simple JPEG magic number check
function isJpeg(buffer) { return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9 }

export async function handler(event) {
  try {
    const { trackId, picIndex } = event.pathParameters
    const body = Buffer.from(event.body, 'base64')

    logger.info(`add picture for track ${trackId} index ${picIndex} size ${body.length}`)

    // Validate size
    if (body.length > 1000000) {
      return {
        statusCode: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: messages.WARN_PAYLOAD_TOO_LARGE,
          description: 'Image exceeds 1MB limit'
        })
      }
    }

    // Validate JPEG
    if (!isJpeg(body)) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: messages.WARN_INVALID_INPUT,
          description: 'Only JPEG images are allowed'
        })
      }
    }

    // Construct S3 key
    const key = `${trackId}/pictures/${picIndex}.jpg`

    await s3.send(new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: 'image/jpeg'
    }))

    return {
      statusCode: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId, picIndex })
    }
  } catch (err) {
    logger.error('S3 write error', err.message)
    return {
      statusCode: 507,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: messages.ERROR_S3,
        description: err.message
      })
    }
  }
}
