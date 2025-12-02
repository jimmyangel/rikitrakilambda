import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { corsHeaders, messages } from "../utils/config.mjs"
import * as logger from "../utils/logger.mjs"
import { validate } from '../utils/schemaValidator.mjs'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event, context) => {
    const TABLE_NAME = process.env.TABLE_NAME
    const JWT_SECRET = process.env.JWT_SECRET
    const JWT_ISSUER = process.env.JWT_ISSUER

  try {
    const username = event.pathParameters?.username
    const body = JSON.parse(event.body || "{}")
    const authHeader = event.headers?.authorization

    if (!username || !authHeader) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: messages.WARN_MISSING_USERNAME_OR_TOKEN })
      }
    }

    // Validate token
    try {
      jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: "passwordreset"
      })
    } catch (err) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: messages.WARN_INVALID_TOKEN })
      }
    }

    // Validate body against schema
    // validate schema
    const { valid, errors } = validate('userProfileUpdateSchema', body)
    if (!valid) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'InvalidInput', description: errors }) }
    }

    // Hash password and set lastUpdatedDate
    const hashed = bcrypt.hashSync(body.password, 8)
    const now = new Date().toISOString()

    // DynamoDB update
    // Unset inactive to enable another way of activating an account
    try {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${username}`, SK: "METADATA" },
        UpdateExpression: "SET password = :p, lastUpdatedDate = :d REMOVE isInactive",
        ExpressionAttributeValues: {
          ":p": hashed,
          ":d": now
        }
      }))
    } catch (err) {
      logger.error(messages.ERROR_DB, { err: { message: err.message } }, context)
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "DatabaseUpdateError", description: err.message })
      }
    }

    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
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
