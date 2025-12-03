import * as logger from '../utils/logger.mjs'
import { corsHeaders, messages } from '../utils/config.mjs'
import jwt from 'jsonwebtoken'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event, context) => {
  const TABLE_NAME = process.env.TABLE_NAME
  const JWT_SECRET = process.env.JWT_SECRET
  const JWT_ISSUER = process.env.JWT_ISSUER

  try {
    const username = event.pathParameters?.username
    if (!username) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'InvalidInput', description: 'Missing username path parameter' })
      }
    }

    // Extract bearer token
    const authHeader = event.headers?.authorization || event.headers?.Authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'MissingToken', description: 'Authorization bearer token is required' })
      }
    }

    // Verify JWT and issuer; subject must match path username
    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER })
    } catch (e) {
      logger.warn('invalid activation token', { err: { message: e.message } })
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'InvalidToken', description: 'Token is invalid or expired' })
      }
    }

    if (payload.sub !== username) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'TokenSubjectMismatch', description: 'Token subject does not match username' })
      }
    }

    const nowIso = new Date().toISOString()

    // Activate: remove isInactive, set lastUpdatedDate
    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${username}`, SK: `METADATA#${username}` },
        UpdateExpression: 'REMOVE isInactive SET lastUpdatedDate = :now',
        ExpressionAttributeValues: { ':now': nowIso },
        ConditionExpression: 'attribute_exists(PK)'
      }))

      return { statusCode: 204, headers: corsHeaders }
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'NotFound', description: 'User does not exist' })
        }
      }
      logger.error(messages.ERROR_DB_USER, { err: { message: err.message } })
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'DatabaseUpdateError', description: err.message })
      }
    }
  } catch (err) {
    logger.error(messages.ERROR_DB, { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: messages.ERROR_DB })
    }
  }
}
