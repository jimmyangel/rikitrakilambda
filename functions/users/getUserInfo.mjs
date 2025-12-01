import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import jwt from 'jsonwebtoken'
import { corsHeaders } from '../utils/config.mjs'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event) => {

    const TABLE_NAME = process.env.TABLE_NAME
    const JWT_SECRET = process.env.JWT_SECRET

    try {
        // Extract and validate token
        const auth = event.headers?.Authorization || ''
        if (!auth.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unauthorized', description: 'Missing or invalid token' })
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
                body: JSON.stringify({ error: 'Unauthorized', description: 'Invalid token' })
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
                body: JSON.stringify({ error: 'NotFound', description: 'username not found' })
            }
        }

    } catch (err) {
        console.error('Error in getUserInfo:', err)
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'InternalServerError' })
        }
    }
}
