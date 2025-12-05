import * as logger from '../utils/logger.mjs'
import { corsHeaders, messages } from '../utils/config.mjs'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { validate } from '../utils/schemaValidator.mjs'
import { schemas } from '../utils/schemas.mjs'
import { sendRegistrationEmail } from '../utils/emailService.mjs'

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event, context) => {
    const TABLE_NAME = process.env.TABLE_NAME
    const JWT_SECRET = process.env.JWT_SECRET
    const JWT_ISSUER = process.env.JWT_ISSUER

    try {
        const body = JSON.parse(event.body || '{}')

        // validate schema
        const { valid, errors } = validate('userRegistrationSchema', body)
        if (!valid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'InvalidInput', description: errors }) }
        }

        const hashedPassword = bcrypt.hashSync(body.password, 8)
        const nowIso = new Date().toISOString()

        // Primary user record (METADATA)
        const userItem = {
            PK: `USER#${body.username}`,
            SK: `METADATA#${body.username}`,
            username: body.username,
            email: body.email,
            password: hashedPassword,
            createdDate: nowIso,
            isInactive: true
        }

        // Email lookup record
        const emailItem = {
            PK: `EMAIL#${body.email}`,
            SK: `EMAIL`,
            username: body.username
        }

        // Atomically write both items
        try {
            await ddb.send(new TransactWriteCommand({
                TransactItems: [
                    {
                        Put: {
                            TableName: TABLE_NAME,
                            Item: userItem,
                            ConditionExpression: 'attribute_not_exists(PK)'
                        }
                    },
                    {
                        Put: {
                            TableName: TABLE_NAME,
                            Item: emailItem,
                            ConditionExpression: 'attribute_not_exists(PK)'
                        }
                    }
                ]
            }))
        } catch (err) {
            if (err.name === 'TransactionCanceledException' || err.code === 'ConditionalCheckFailedException') {
                return {
                    statusCode: 422,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Duplicate', description: messages.WARN_USER_EXISTS })
                }
            }
            logger.error(messages.ERROR_DB_USER, { err: { message: err.message } }, context)
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'DatabaseInsertError', description: err.message })
            }
        }

        // Generate activation token
        const token = jwt.sign({ iss: JWT_ISSUER, sub: body.username }, JWT_SECRET)

        // Send activation email via centralized emailService
        try {
            await sendRegistrationEmail({
                to: body.email,
                username: body.username,
                token,
                rturl: body.rturl
            })
        } catch (mailErr) {
            logger.error(messages.ERROR_MAILGUN_SEND, { err: { message: mailErr.message } }, context)
            // Don’t fail user creation if email fails
        }

        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({ username: body.username })
        }
    } catch (err) {
        logger.error(messages.ERROR_DB_USER, { err: { message: err.message } }, context)
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: messages.ERROR_DB })
        }
    }
}
