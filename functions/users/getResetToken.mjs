import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb"
import jwt from "jsonwebtoken"
import { corsHeaders, messages } from "../utils/config.mjs"
import * as logger from "../utils/logger.mjs"
import { sendResetEmail } from "../utils/emailService.mjs"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event, context) => {

    const TABLE_NAME = process.env.TABLE_NAME
    const JWT_SECRET = process.env.JWT_SECRET
    const JWT_ISSUER = process.env.JWT_ISSUER

  try {
    const email = event.queryStringParameters?.email
    const rturl = event.queryStringParameters?.rturl

    if (!email || !rturl) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: messages.WARN_INVALID_INPUT })
      }
    }

    // DynamoDB lookup using your schema
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EMAIL#${email}`,
        SK: "EMAIL"
      },
      ProjectionExpression: "username"
    }))

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "NotFound", description: messages.WARN_USER_NOT_FOUND })
      }
    }

    const { username } = result.Item

    const token = jwt.sign(
      {
        iss: JWT_ISSUER,
        sub: username,
        exp: Math.floor(Date.now() / 1000) + 86400, // 24h expiry
        aud: "passwordreset"
      },
      JWT_SECRET
    )

    await sendResetEmail({ to: email, username, token, rturl })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: "reset password email sent" })
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
