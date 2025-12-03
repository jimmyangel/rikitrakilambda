import { handler } from '../../functions/users/activateAccount.mjs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import * as logger from '../../functions/utils/logger.mjs'
import jwt from 'jsonwebtoken'
import { messages } from '../../functions/utils/config.mjs'

describe('activateAccount handler (unit)', () => {
  let ddbSpy
  let jwtSpy

  const fakeContext = { awsRequestId: 'test-id' }

  beforeEach(() => {
    process.env.TABLE_NAME = 'test-table'
    process.env.JWT_SECRET = 'secret'
    process.env.JWT_ISSUER = 'issuer'

    ddbSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    jwtSpy = jest.spyOn(jwt, 'verify')

    jest.spyOn(logger, 'error').mockImplementation(() => {})
    jest.spyOn(logger, 'warn').mockImplementation(() => {})
    jest.spyOn(logger, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns 400 when username missing', async () => {
    const event = { pathParameters: {}, headers: { authorization: 'Bearer token' } }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toEqual({
      error: 'InvalidInput',
      description: 'Missing username path parameter'
    })
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 401 when token missing', async () => {
    const event = { pathParameters: { username: 'alice' }, headers: {} }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('MissingToken')
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 401 when token invalid', async () => {
    jwtSpy.mockImplementation(() => { throw new Error('bad token') })
    const event = { pathParameters: { username: 'alice' }, headers: { authorization: 'Bearer bad' } }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('InvalidToken')
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 403 when token subject mismatch', async () => {
    jwtSpy.mockReturnValue({ sub: 'bob', iss: process.env.JWT_ISSUER })
    const event = { pathParameters: { username: 'alice' }, headers: { authorization: 'Bearer good' } }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toBe('TokenSubjectMismatch')
    expect(ddbSpy).not.toHaveBeenCalled()
  })

  it('returns 404 when user not found', async () => {
    jwtSpy.mockReturnValue({ sub: 'alice', iss: process.env.JWT_ISSUER })
    const err = new Error('not found')
    err.name = 'ConditionalCheckFailedException'
    ddbSpy.mockRejectedValueOnce(err)

    const event = { pathParameters: { username: 'alice' }, headers: { authorization: 'Bearer good' } }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toBe('NotFound')
  })

  it('returns 500 when DynamoDB throws', async () => {
    jwtSpy.mockReturnValue({ sub: 'alice', iss: process.env.JWT_ISSUER })
    ddbSpy.mockRejectedValueOnce(new Error('DynamoDB failure'))

    const event = { pathParameters: { username: 'alice' }, headers: { authorization: 'Bearer good' } }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toBe('DatabaseUpdateError')
    expect(logger.error).toHaveBeenCalledWith(
      messages.ERROR_DB_USER,
      expect.objectContaining({
        err: expect.objectContaining({ message: 'DynamoDB failure' })
      })
    )
  })

  it('returns 204 when update succeeds', async () => {
    jwtSpy.mockReturnValue({ sub: 'alice', iss: process.env.JWT_ISSUER })
    ddbSpy.mockResolvedValueOnce({})

    const event = { pathParameters: { username: 'alice' }, headers: { authorization: 'Bearer good' } }
    const res = await handler(event, fakeContext)

    expect(res.statusCode).toBe(204)
    expect(res.body).toBeUndefined() // no body on 204
    expect(ddbSpy).toHaveBeenCalled()
  })
})
