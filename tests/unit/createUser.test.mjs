// tests/unit/createUser.test.mjs
import { handler } from '../../functions/users/createUser.mjs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import * as emailService from '../../functions/utils/emailService.mjs'
import jwt from 'jsonwebtoken'
import * as logger from '../../functions/utils/logger.mjs'
import { messages } from '../../functions/utils/config.mjs'

describe('createUser handler (unit)', () => {
  let ddbSpy
  let jwtSpy
  let emailSpy

  const fakeContext = { awsRequestId: 'test-id' }

  beforeEach(() => {
    process.env.TABLE_NAME = 'UsersTable'
    process.env.JWT_SECRET = 'secret'
    process.env.JWT_ISSUER = 'issuer'

    ddbSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    jwtSpy = jest.spyOn(jwt, 'sign').mockReturnValue('mockToken')
    emailSpy = jest.spyOn(emailService, 'sendRegistrationEmail')

    jest.spyOn(logger, 'error').mockImplementation(() => {})
    jest.spyOn(logger, 'info').mockImplementation(() => {})
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns 400 when validation fails', async () => {
    const event = { body: JSON.stringify({}) }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBeDefined()
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 201 when user is created successfully', async () => {
    ddbSpy.mockResolvedValueOnce({})

    const event = {
      body: JSON.stringify({
        username: 'alice01',
        email: 'alice@example.com',
        password: 'pw012345',
        rturl: 'http://test/'
      })
    }

    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toEqual({ username: 'alice01' })
    expect(jwtSpy).toHaveBeenCalled()
    expect(emailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        username: 'alice01',
        token: 'mockToken',
        rturl: 'http://test/'
      })
    )
  })

  it('returns 422 when duplicate user/email exists', async () => {
    const error = new Error('duplicate')
    error.name = 'TransactionCanceledException'
    ddbSpy.mockRejectedValueOnce(error)

    const event = {
      body: JSON.stringify({
        username: 'bob01234',
        email: 'bob@example.com',
        password: 'pw012345',
        rturl: 'http://test/'
      })
    }

    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(422)
  })

  it('returns 500 when DynamoDB fails unexpectedly', async () => {
    const error = new Error('db error')
    ddbSpy.mockRejectedValueOnce(error)

    const event = {
      body: JSON.stringify({
        username: 'carol567',
        email: 'carol@example.com',
        password: 'pw012345',
        rturl: 'http://test/'
      })
    }

    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body)).toEqual({
      error: 'DatabaseInsertError',
      description: 'db error'
    })
    expect(logger.error).toHaveBeenCalledWith(
      messages.ERROR_DB_USER,
      expect.objectContaining({
        err: expect.objectContaining({ message: 'db error' })
      }),
      fakeContext
    )
  })
})
