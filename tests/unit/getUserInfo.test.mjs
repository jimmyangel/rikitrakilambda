import { handler } from '../../functions/users/getUserInfo.mjs'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { corsHeaders } from '../../functions/utils/config.mjs'
import jwt from 'jsonwebtoken'

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}))

describe('getUserInfo handler', () => {
  beforeEach(() => {
    jest.spyOn(DynamoDBDocumentClient.prototype, 'send').mockResolvedValue({
      Item: { username: 'ricardo', email: 'ricardo@example.com', displayName: 'Ricardo' }
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns user info when token is valid', async () => {
    jwt.verify.mockReturnValue({ username: 'ricardo' })

    const event = {
      headers: { Authorization: 'Bearer valid.jwt.token' }
    }

    const response = await handler(event)
    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual(corsHeaders)

    const body = JSON.parse(response.body)
    expect(body.username).toBe('ricardo')
    expect(body.email).toBe('ricardo@example.com')
  })

  it('returns 401 when token is missing', async () => {
    const event = { headers: {} }
    const response = await handler(event)

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when token is invalid', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('bad token') })

    const event = { headers: { Authorization: 'Bearer bad.jwt.token' } }
    const response = await handler(event)

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 404 when user not found', async () => {
    jwt.verify.mockReturnValue({ username: 'ghost' })
    DynamoDBDocumentClient.prototype.send.mockResolvedValueOnce({})

    const event = { headers: { Authorization: 'Bearer valid.jwt.token' } }
    const response = await handler(event)

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('NotFound')
  })

  it('returns 500 on DynamoDB error', async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})

    jwt.verify.mockReturnValue({ username: 'ricardo' })
    DynamoDBDocumentClient.prototype.send.mockRejectedValueOnce(new Error('DDB fail'))

    const event = { headers: { Authorization: 'Bearer valid.jwt.token' } }
    const response = await handler(event)

    expect(response.statusCode).toBe(500)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('InternalServerError')

    spy.mockRestore()
  })
})
