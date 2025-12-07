import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { corsHeaders, messages } from '../utils/config.mjs'
import * as logger from '../utils/logger.mjs'
import { verifyJwt } from '../utils/auth.mjs'

const s3 = new S3Client({})

export const handler = async (event, context) => {
  try {
    // Validate JWT
    const jwtResult = verifyJwt(event)
    if (jwtResult.statusCode) return jwtResult
    const username = jwtResult.sub

    const { trackId, picIndex } = event.pathParameters
    const bucket = process.env.BUCKET_NAME
    const key = `${trackId}/pictures/${picIndex}.jpg`

    await s3.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    }))

    return {
      statusCode: 204,
      headers: corsHeaders,
      body: null
    }

  } catch (err) {
    logger.error(messages.ERROR_DELETE_PIC, { err: { message: err.message } }, context)
    return {
      statusCode: err.name === 'NoSuchKey' ? 404 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: messages.ERROR_DELETE_PIC, description: err.message })
    }
  }
}
