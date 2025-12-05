import jwt from 'jsonwebtoken'
import * as logger from '../utils/logger.mjs'
import { corsHeaders } from './config.mjs'

export function verifyJwt(event, expectedUsername) {
    const JWT_SECRET = process.env.JWT_SECRET
    const JWT_ISSUER = process.env.JWT_ISSUER

    const authHeader = event.headers?.authorization || event.headers?.Authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
    return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            error: 'MissingToken',
            description: 'Authorization bearer token is required'
        })
    }
    }

    let payload
    try {
    payload = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER })
    } catch (e) {
    logger.warn('invalid token', { err: { message: e.message } })
    return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            error: 'InvalidToken',
            description: 'Token is invalid or expired'
        })
    }
    }

    // Only enforce subject match if expectedUsername is provided
    if (expectedUsername && payload.sub !== expectedUsername) {
    return {
        statusCode: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            error: 'TokenSubjectMismatch',
            description: 'Token subject does not match username'
        })
    }
    }

  return payload
}


