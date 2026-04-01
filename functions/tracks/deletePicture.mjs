import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { corsHeaders, messages } from '../utils/config.mjs'
import * as logger from '../utils/logger.mjs'
import { verifyJwt } from '../utils/auth.mjs'

const s3 = new S3Client({})
const ddb = new DynamoDBClient({})

export const handler = async (event, context) => {
  try {
    // ------------------------------------------------------------
    // JWT VALIDATION
    // ------------------------------------------------------------
    const jwtResult = verifyJwt(event)
    if (jwtResult.statusCode) return jwtResult

    const username = jwtResult.sub
    const tokenIsAdmin = jwtResult.isAdmin === true

    const { trackId, picIndex } = event.pathParameters

    // ------------------------------------------------------------
    // TRACK METADATA LOOKUP
    // ------------------------------------------------------------
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

    const owner = track.Item.username?.S

    // ------------------------------------------------------------
    // ADMIN CHECK (optimized)
    // ------------------------------------------------------------
    let isAdmin = false

    if (tokenIsAdmin) {
      const userResp = await ddb.send(new GetItemCommand({
        TableName: process.env.TABLE_NAME,
        Key: {
          PK: { S: `USER#${username}` },
          SK: { S: 'METADATA' }
        }
      }))

      isAdmin = userResp.Item?.isAdmin?.BOOL === true
    }

    // ------------------------------------------------------------
    // OWNERSHIP CHECK (skip if admin)
    // ------------------------------------------------------------
    if (!isAdmin && owner !== username) {
      return {
        statusCode: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Forbidden',
          description: 'You do not own this track.'
        })
      }
    }

    // ------------------------------------------------------------
    // DELETE FROM S3 (IDEMPOTENT)
    // ------------------------------------------------------------
    const bucket = process.env.BUCKET_NAME
    const key = `${trackId}/pictures/${picIndex}.jpg`

    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      }))
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        logger.warn('Picture already missing', { trackId, picIndex })
      } else {
        throw err
      }
    }

    return {
      statusCode: 204,
      headers: corsHeaders,
      body: null
    }

  } catch (err) {
    logger.error(messages.ERROR_DELETE_PIC, { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: messages.ERROR_DELETE_PIC,
        description: err.message
      })
    }
  }
}
