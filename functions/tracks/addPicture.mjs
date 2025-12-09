import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import * as logger from '../utils/logger.mjs'
import { corsHeaders, messages } from '../utils/config.mjs'

const s3 = new S3Client({})
const ddb = new DynamoDBClient({})

// Simple JPEG magic number check
function isJpeg(buffer) { return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9 }

export async function handler(event, context) {
  try {
    const { trackId, picIndex } = event.pathParameters
    const body = Buffer.from(event.body, 'base64')

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

    // Check if trackId exists in DynamoDB
    const track = await ddb.send(new GetItemCommand({
        TableName: process.env.TABLE_NAME,
        Key: {
            PK: { S: `TRACK#${trackId}` },
            SK: { S: 'METADATA' }
        }
    }))

    if (!track.Item) {
      return {
        statusCode: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: messages.WARN_INVALID_INPUT,
          description: `Track ${trackId} not found`
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
    logger.error(messages.ERROR_S3, { err: { message: err.message } }, context)
    return {
      statusCode: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: messages.ERROR_S3,
        description: err.message
      })
    }
  }
}
