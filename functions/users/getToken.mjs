import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { corsHeaders } from "../utils/config.mjs"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event) => {

    const TABLE_NAME = process.env.TABLE_NAME
    const JWT_SECRET = process.env.JWT_SECRET
    const JWT_ISSUER = process.env.JWT_ISSUER

    try {
    // Parse Basic Auth header
        const authHeader = event.headers?.Authorization || event.headers?.authorization
        if (!authHeader || !authHeader.startsWith("Basic ")) {
            return {
            statusCode: 401,
            headers: { ...corsHeaders, "WWW-Authenticate": "AJAXFormBased" },
            body: ""
            }
        }

        const base64Credentials = authHeader.slice(6)
        const [username, password] = Buffer.from(base64Credentials, "base64").toString().split(":")

        // Look up user in DynamoDB
        const result = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${username}`,
                SK: "METADATA"
            }
        }))

        const user = result?.Item
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return {
            statusCode: 401,
            headers: { ...corsHeaders, "WWW-Authenticate": "AJAXFormBased" },
            body: ""
            }
        }

        // Issue JWT
        const token = jwt.sign({ iss: JWT_ISSUER, sub: username }, JWT_SECRET)

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                "Content-Type": "text/html; charset=utf-8",
            },
            body: token
        }

        } catch (err) {
            console.error("authentication error", err)
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: "DBError", description: "cannot connect to database" })
            }
    }
}

