import { handler } from '../../functions/users/resetPassword.mjs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import * as logger from '../../functions/utils/logger.mjs'
import * as schemaValidator from '../../functions/utils/schemaValidator.mjs'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { messages } from '../../functions/utils/config.mjs'

describe('resetPassword handler (unit)', () => {
  let ddbSpy
  let jwtSpy
  let bcryptSpy
  let validateSpy

  const fakeContext = { awsRequestId: 'test-id' }

  beforeEach(() => {
    process.env.TABLE_NAME = 'test-table'
    process.env.JWT_SECRET = 'secret'
    process.env.JWT_ISSUER = 'issuer'

    ddbSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    jwtSpy = jest.spyOn(jwt, 'verify')
    bcryptSpy = jest.spyOn(bcrypt, 'hashSync').mockReturnValue('hashedpw')
    validateSpy = jest.spyOn(schemaValidator, 'validate')

    jest.spyOn(logger, 'error').mockImplementation(() => {})
    jest.spyOn(logger, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns 400 when username or token missing', async () => {
    const event = { pathParameters: {}, headers: {} }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toEqual({ error: messages.WARN_MISSING_USERNAME_OR_TOKEN })
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 401 when token invalid', async () => {
    jwtSpy.mockImplementation(() => { throw new Error('bad token') })
    const event = {
      pathParameters: { username: 'riki' },
      headers: { authorization: 'Bearer bad' },
      body: JSON.stringify({ password: 'pw' })
    }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toEqual({ error: messages.WARN_INVALID_TOKEN })
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 400 when body invalid', async () => {
    jwtSpy.mockReturnValue({ sub: 'riki' })
    validateSpy.mockReturnValue({ valid: false, errors: ['bad field'] })

    const event = {
      pathParameters: { username: 'riki' },
      headers: { authorization: 'Bearer good' },
      body: JSON.stringify({ password: 'pw' })
    }

    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toEqual({ error: 'InvalidInput', description: ['bad field'] })
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 500 when DynamoDB throws', async () => {
    jwtSpy.mockReturnValue({ sub: 'riki' })
    validateSpy.mockReturnValue({ valid: true, errors: [] })
    ddbSpy.mockRejectedValueOnce(new Error('DynamoDB failure'))

    const event = {
      pathParameters: { username: 'riki' },
      headers: { authorization: 'Bearer good' },
      body: JSON.stringify({ password: 'pw' })
    }

    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body)).toEqual({
      error: 'DatabaseUpdateError',
      description: 'DynamoDB failure'
    })
    expect(logger.error).toHaveBeenCalledWith(
      messages.ERROR_DB,
      expect.objectContaining({
        err: expect.objectContaining({ message: 'DynamoDB failure' })
      }),
      fakeContext
    )
  })

  it('returns 204 when update succeeds', async () => {
    jwtSpy.mockReturnValue({ sub: 'riki' })
    validateSpy.mockReturnValue({ valid: true, errors: [] })
    ddbSpy.mockResolvedValueOnce({})

    const event = {
      pathParameters: { username: 'riki' },
      headers: { authorization: 'Bearer good' },
      body: JSON.stringify({ password: 'pw' })
    }

    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
    expect(ddbSpy).toHaveBeenCalled()
    expect(bcryptSpy).toHaveBeenCalledWith('pw', 8)
  })
})
