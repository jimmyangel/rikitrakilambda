import jwt from 'jsonwebtoken'

const JWT_SECRET = 'testsecret'
const JWT_ISSUER = 'testissuer'

process.env.JWT_SECRET = JWT_SECRET
process.env.JWT_ISSUER = JWT_ISSUER

import { verifyJwt } from '../../functions/utils/auth.mjs'

describe('verifyJwt', () => {
    const username = 'ricardo'

    it('returns MissingToken when no Authorization header', () => {
        const event = { headers: {} }
        const response = verifyJwt(event, username)
        expect(response.statusCode).toBe(401)
        expect(JSON.parse(response.body).error).toBe('MissingToken')
    })

    it('returns InvalidToken when token is invalid', () => {
        const event = { headers: { Authorization: 'Bearer badtoken' } }
        const response = verifyJwt(event, username)
        expect(response.statusCode).toBe(401)
        expect(JSON.parse(response.body).error).toBe('InvalidToken')
    })

    it('returns TokenSubjectMismatch when sub does not match expected username', () => {
        // Sign with the same secret and issuer, but a different subject
        const token = jwt.sign(
            { sub: 'otheruser' }, JWT_SECRET,{ issuer: JWT_ISSUER } 
        )
        const event = { headers: { Authorization: `Bearer ${token}` } }
        const response = verifyJwt(event, 'ricardo')

        expect(response.statusCode).toBe(403)
        expect(JSON.parse(response.body).error).toBe('TokenSubjectMismatch')
    })
    it('returns payload when token is valid and subject matches', () => {
        const token = jwt.sign({ sub: username }, JWT_SECRET, { issuer: JWT_ISSUER })
        const event = { headers: { Authorization: `Bearer ${token}` } }
        const response = verifyJwt(event, username)
        expect(response.sub).toBe(username)
        expect(response.iss).toBe(JWT_ISSUER)
    })

    it('returns payload when token is valid and there is no username', () => {
        const token = jwt.sign({ sub: username }, JWT_SECRET, { issuer: JWT_ISSUER })
        const event = { headers: { Authorization: `Bearer ${token}` } }
        const response = verifyJwt(event)
        expect(response.iss).toBe(JWT_ISSUER)
    })
})
