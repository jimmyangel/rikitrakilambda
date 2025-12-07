// functions/tracks/deleteTrack.mjs
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import * as logger from '../utils/logger.mjs'
import { corsHeaders, messages } from '../utils/config.mjs'
import { verifyJwt } from '../utils/auth.mjs'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})

export const handler = async (event, context) => {
  try {
    const { trackId } = event.pathParameters || {}

    if (!trackId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'MissingTrackId' })
      }
    }

    // Validate JWT
    const jwtResult = verifyJwt(event)
    if (jwtResult.statusCode) {
      return jwtResult
    }
    const username = jwtResult.sub

    // --- Delete S3 objects under this track prefix ---
    const bucket = process.env.BUCKET_NAME
    const listResp = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${trackId}/`
    }))

    if (listResp.Contents && listResp.Contents.length > 0) {
      const objects = listResp.Contents.map(obj => ({ Key: obj.Key }))
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects }
      }))
    }

    // --- Delete DynamoDB items ---
    // First query all items for this track
    const queryResp = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `TRACK#${trackId}` }
    }))

    if (queryResp.Items && queryResp.Items.length > 0) {
      const deleteRequests = queryResp.Items.map(item => ({
        DeleteRequest: {
          Key: { PK: item.PK, SK: item.SK }
        }
      }))

      // BatchWrite supports 25 items max per request
      while (deleteRequests.length > 0) {
        const batch = deleteRequests.splice(0, 25)
        await ddb.send(new BatchWriteCommand({
          RequestItems: {
            [process.env.TABLE_NAME]: batch
          }
        }))
      }
    }

    return {
      statusCode: 204,
      headers: corsHeaders,
      body: null
    }
  } catch (err) {
    logger.error(messages.ERROR_DB_TRACK, { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'DeleteTrackError', description: err.message })
    }
  }
}
