// tests/unit/createUser.test.mjs
import { handler } from '../../functions/users/createUser.mjs'
import * as emailService from '../../functions/utils/emailService.mjs'
import jwt from 'jsonwebtoken'

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({}))
}))

jest.mock('@aws-sdk/lib-dynamodb', () => {
    const sendMock = jest.fn()
    return {
        DynamoDBDocumentClient: {
            from: jest.fn(() => ({ send: sendMock }))
        },
        TransactWriteCommand: jest.fn((params) => params),
        // expose sendMock so tests can access it
        __sendMock: sendMock
    }
})

// Import the exposed mock
import { __sendMock as sendMock } from '@aws-sdk/lib-dynamodb'

// Mock email service
jest.mock('../../functions/utils/emailService.mjs', () => ({
    sendRegistrationEmail: jest.fn()
}))

// Mock JWT
jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(() => 'mockToken')
}))

describe('createUser handler', () => {
    const TABLE_NAME = 'UsersTable'
    const JWT_SECRET = 'secret'
    const JWT_ISSUER = 'issuer'

    beforeEach(() => {
        process.env.TABLE_NAME = TABLE_NAME
        process.env.JWT_SECRET = JWT_SECRET
        process.env.JWT_ISSUER = JWT_ISSUER
        jest.clearAllMocks()
    })

    it('returns 400 when validation fails', async () => {
        const event = { body: JSON.stringify({}) }
        const result = await handler(event)
        expect(result.statusCode).toBe(400)
        expect(JSON.parse(result.body).error).toBeDefined()
    })

    it('returns 201 when user is created successfully', async () => {
        sendMock.mockResolvedValueOnce({})
        const event = { body: JSON.stringify({ username: 'alice01', email: 'alice@example.com', password: 'pw012345', rturl: 'http://test/' }) }
        const result = await handler(event)
        expect(result.statusCode).toBe(201)
        expect(JSON.parse(result.body)).toEqual({ username: 'alice01' })
        expect(jwt.sign).toHaveBeenCalled()
        expect(emailService.sendRegistrationEmail).
            toHaveBeenCalledWith(expect.objectContaining({to: 'alice@example.com', username: 'alice01', token: 'mockToken', rturl: 'http://test/'}))    })

    it('returns 422 when duplicate user/email exists', async () => {
        const error = new Error('duplicate')
        error.name = 'TransactionCanceledException'
        sendMock.mockRejectedValueOnce(error)
        const event = { body: JSON.stringify({ username: 'bob01234', email: 'bob@example.com', password: 'pw012345', rturl: 'http://test/' }) }
        const result = await handler(event)
        expect(result.statusCode).toBe(422)
    })

    it('returns 500 when DynamoDB fails unexpectedly', async () => {
        const error = new Error('db error')
        sendMock.mockRejectedValueOnce(error)
        const event = { body: JSON.stringify({ username: 'carol567', email: 'carol@example.com', password: 'pw012345', rturl: 'http://test/' }) }
        const result = await handler(event)
        expect(result.statusCode).toBe(500)
    })
})
