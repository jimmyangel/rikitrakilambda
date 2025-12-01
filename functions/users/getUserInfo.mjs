import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import jwt from 'jsonwebtoken'
import { corsHeaders, messages } from '../utils/config.mjs'
import  *  as logger from "../utils/logger.mjs"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event, context) => {

    const TABLE_NAME = process.env.TABLE_NAME
    const JWT_SECRET = process.env.JWT_SECRET

    try {
        // Extract and validate token
        const auth = event.headers?.Authorization || ''
        if (!auth.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unauthorized', description: messages.WARN_INVALID_TOKEN })
            }
        }

        const token = auth.slice(7)

        let decoded
        try {
            decoded = jwt.verify(token, JWT_SECRET)
        } catch (err) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unauthorized', description: messages.WARN_INVALID_TOKEN })
            }
        }

        const username = decoded.sub

        // Look up user in DynamoDB
        const result = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${username}`,
                SK: "METADATA"
            }
        }))

        if (result.Item) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({username: result.Item.username, email: result.Item.email})
            }
        } else {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'NotFound', description: messages.WARN_USER_NOT_FOUND })
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
