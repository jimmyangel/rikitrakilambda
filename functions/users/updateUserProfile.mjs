import bcrypt from 'bcryptjs'
import { Buffer } from 'node:buffer'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { validate } from '../utils/schemaValidator.mjs'
import { corsHeaders } from "../utils/config.mjs"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event) => {

    const TABLE_NAME = process.env.TABLE_NAME

    let bodyString = event.body

    if (event.isBase64Encoded) {
        bodyString = Buffer.from(event.body, 'base64').toString('utf-8')
    }

    try {
        const body = JSON.parse(bodyString)

        // validate schema
        const { valid, errors } = validate('userProfileUpdateSchema', body)
        if (!valid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'InvalidInput', description: errors }) }
        }

        // parse Basic Auth header
        const authHeader = event.headers?.authorization || event.headers?.Authorization
        if (!authHeader?.startsWith('Basic ')) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'AuthError', description: 'Missing Basic auth header' }) }
        }

        const base64Credentials = authHeader.split(' ')[1]
        const [username, currentPassword] = Buffer.from(base64Credentials, 'base64').toString().split(':')

        if (!username || !currentPassword) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'AuthError', description: 'Invalid Basic auth format' }) }
        }

        // fetch user record
        const existing = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${username}`, SK: 'METADATA' }
        }))

        const storedHash = existing.Item?.password
        const storedEmail = existing.Item?.email

        if (!storedHash || !bcrypt.compareSync(currentPassword, storedHash)) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'AuthError', description: 'Invalid current password' }) }
        }

        // guard: empty body
        if (!body.email && !body.password) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'InvalidInput', description: 'No data' }) }
        }

        const transactItems = []
        const updates = {}

        // only update password if different
        if (body.password && !bcrypt.compareSync(body.password, storedHash)) {
            updates.password = bcrypt.hashSync(body.password, 8)
        }

        // only update email if different
        if (body.email && body.email !== storedEmail) {
            transactItems.push({
            Put: {
                TableName: TABLE_NAME,
                Item: { PK: `EMAIL#${body.email}`, SK: 'EMAIL', username },
                ConditionExpression: 'attribute_not_exists(PK)'
            }
            })
            if (storedEmail) {
            transactItems.push({
                Delete: {
                TableName: TABLE_NAME,
                Key: { PK: `EMAIL#${storedEmail}`, SK: 'EMAIL' }
                }
            })
            }
            updates.email = body.email
        }

        // if values provided but same as existing → 204
        if (Object.keys(updates).length === 0) {
            return { statusCode: 204, headers: corsHeaders }
        }

        updates.lastUpdatedDate = new Date().toISOString()

        transactItems.push({
            Update: {
                TableName: TABLE_NAME,
                Key: { PK: `USER#${username}`, SK: 'METADATA' },
                UpdateExpression: 'SET #email = :email, #password = :password, #lastUpdatedDate = :lastUpdatedDate',
                ExpressionAttributeNames: {
                    '#email': 'email',
                    '#password': 'password',
                    '#lastUpdatedDate': 'lastUpdatedDate'
                },
                ExpressionAttributeValues: {
                    ':email': updates.email ?? storedEmail,
                    ':password': updates.password ?? storedHash,
                    ':lastUpdatedDate': updates.lastUpdatedDate
                }
            }
        })

        await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }))
        return { statusCode: 204, headers: corsHeaders }

    } catch (err) {
        console.error('Caught error:', {name: err.name, message: err.message, stack: err.stack})
        if (err.name === 'TransactionCanceledException') {
            return { statusCode: 422, headers: corsHeaders, body: JSON.stringify({ error: 'Duplicate', description: 'Email already exists' }) }
        }
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'DatabaseUpdateError', description: err.message }) }
    }
}
