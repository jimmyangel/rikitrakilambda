import { handler } from '../../functions/users/getResetToken.mjs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import * as emailService from '../../functions/utils/emailService.mjs'
import * as logger from '../../functions/utils/logger.mjs'
import { messages } from '../../functions/utils/config.mjs'

describe('getResetToken handler (unit)', () => {
  let ddbSpy
  let sendSpy

  beforeEach(() => {
    process.env.JWT_SECRET = 'testsecret'
    process.env.JWT_ISSUER = 'testissuer'
    process.env.TABLE_NAME = 'testtable'

    ddbSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    sendSpy = jest.spyOn(emailService, 'sendResetEmail').mockResolvedValue({ id: 'mocked' })
    jest.spyOn(logger, 'info').mockImplementation(() => {})
    jest.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns 400 when email or rturl is missing', async () => {
    const event = { queryStringParameters: {} }
    const response = await handler(event)

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ error: messages.WARN_INVALID_INPUT })
    expect(ddbSpy).not.toHaveBeenCalled()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('returns 404 when user not found', async () => {
    ddbSpy.mockResolvedValueOnce({ Item: undefined })
    const event = { queryStringParameters: { email: 'test@example.com', rturl: 'https://app/' } }
    const response = await handler(event)

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ error: 'NotFound', description: messages.WARN_USER_NOT_FOUND })
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('returns 200 when user found and email sent', async () => {
    ddbSpy.mockResolvedValueOnce({ Item: { username: 'riki' } })
    const event = { queryStringParameters: { email: 'test@example.com', rturl: 'https://app/' } }
    const response = await handler(event)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ message: 'reset password email sent' })
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        username: 'riki',
        rturl: 'https://app/',
        token: expect.any(String)
      })
    )
  })

  it('returns 500 when something throws', async () => {
    // Simulate DynamoDB throwing
    ddbSpy.mockRejectedValueOnce(new Error('DynamoDB failure'))

    const event = { queryStringParameters: { email: 'test@example.com', rturl: 'https://app/' } }
    const fakeContext = { awsRequestId: 'test-req-123' }
    const response = await handler(event, fakeContext)

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({ error: messages.ERROR_DB })
    expect(logger.error).toHaveBeenCalledWith(
      messages.ERROR_DB,
      expect.objectContaining({
        err: expect.objectContaining({ message: 'DynamoDB failure' })
      }),
      fakeContext
    )
  })
})
