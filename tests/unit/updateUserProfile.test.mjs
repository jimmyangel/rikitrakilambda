import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import bcrypt from 'bcryptjs'
import { handler } from '../../functions/users/updateUserProfile.mjs'

jest.mock('bcryptjs', () => ({
  compareSync: jest.fn(),
  hashSync: jest.fn(() => 'hashedNewPass')
}))

describe('updateUserProfile Lambda with Basic Auth (PK/SK)', () => {
  beforeEach(() => {
    jest.spyOn(DynamoDBDocumentClient.prototype, 'send').mockReset()
    bcrypt.compareSync.mockReset()
  })

  const makeAuthHeader = (username, password) =>
    'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')

  test('returns 401 when header missing', async () => {
    const event = { headers: {}, body: JSON.stringify({ email: 'new@example.com' }) }
    const result = await handler(event)
    expect(result.statusCode).toBe(401)
  })

  test('returns 401 when password invalid', async () => {
    DynamoDBDocumentClient.prototype.send
      .mockResolvedValueOnce({ Item: { PK: 'USER#ricardo', SK: 'METADATA', password: 'storedHash' } })
    bcrypt.compareSync.mockReturnValue(false)

    const event = {
      headers: { authorization: makeAuthHeader('ricardo', 'wrongPass') },
      body: JSON.stringify({ email: 'new@example.com' })
    }
    const result = await handler(event)
    expect(result.statusCode).toBe(401)
    expect(JSON.parse(result.body).error).toBe('AuthError')
  })

  test('returns 400 when no data provided', async () => {
    DynamoDBDocumentClient.prototype.send
      .mockResolvedValueOnce({ Item: { PK: 'USER#ricardo', SK: 'METADATA', password: 'storedHash', email: 'old@example.com' } })
    bcrypt.compareSync.mockReturnValue(true)

    const event = {
      headers: { authorization: makeAuthHeader('ricardo', 'correctPass') },
      body: JSON.stringify({})
    }
    const result = await handler(event)
    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body).description).toBe('No data')
    expect(DynamoDBDocumentClient.prototype.send).toHaveBeenCalledTimes(1) // only GetCommand
  })

  test('returns 204 when email is same as existing', async () => {
    DynamoDBDocumentClient.prototype.send
      .mockResolvedValueOnce({ Item: { PK: 'USER#ricardo', SK: 'METADATA', password: 'storedHash', email: 'same@example.com' } })
    bcrypt.compareSync.mockReturnValue(true)

    const event = {
      headers: { authorization: makeAuthHeader('ricardo', 'correctPass') },
      body: JSON.stringify({ email: 'same@example.com' })
    }
    const result = await handler(event)
    expect(result.statusCode).toBe(204)
    expect(DynamoDBDocumentClient.prototype.send).toHaveBeenCalledTimes(1)
  })

  test('returns 204 when password is same as existing', async () => {
    DynamoDBDocumentClient.prototype.send
      .mockResolvedValueOnce({ Item: { PK: 'USER#ricardo', SK: 'METADATA', password: 'storedHash', email: 'old@example.com' } })
    bcrypt.compareSync.mockReturnValue(true)

    const event = {
      headers: { authorization: makeAuthHeader('ricardo', 'correctPass') },
      body: JSON.stringify({ password: 'correctPass' })
    }
    const result = await handler(event)
    expect(result.statusCode).toBe(204)
    expect(DynamoDBDocumentClient.prototype.send).toHaveBeenCalledTimes(1)
  })

  test('returns 204 when both email and password are updated', async () => {
    DynamoDBDocumentClient.prototype.send
      .mockResolvedValueOnce({
        Item: {
          PK: 'USER#ricardo',
          SK: 'METADATA',
          password: 'storedHash',
          email: 'old@example.com'
        }
      })
      .mockResolvedValueOnce({}) // TransactWriteCommand succeeds

    bcrypt.compareSync
      .mockReturnValueOnce(true)  // current password check
      .mockReturnValueOnce(false) // new password differs

    const event = {
      headers: { authorization: makeAuthHeader('ricardo', 'correctPass') },
      body: JSON.stringify({ email: 'new@example.com', password: 'newPass' })
    }

    const result = await handler(event)
    expect(result.statusCode).toBe(204)
    expect(DynamoDBDocumentClient.prototype.send).toHaveBeenCalledTimes(2)

    const transactCall = DynamoDBDocumentClient.prototype.send.mock.calls[1][0]
    expect(transactCall.input.TransactItems.some(i => i.Put)).toBe(true)
    expect(transactCall.input.TransactItems.some(i => i.Delete)).toBe(true)
    expect(transactCall.input.TransactItems.some(i => i.Update)).toBe(true)
  })

  test('returns 422 when new email already exists (duplicate)', async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})

    DynamoDBDocumentClient.prototype.send
      .mockResolvedValueOnce({
        Item: {
          PK: 'USER#ricardo',
          SK: 'METADATA',
          password: 'storedHash',
          email: 'old@example.com'
        }
      })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { name: 'TransactionCanceledException' }))

    bcrypt.compareSync
      .mockReturnValueOnce(true)  // current password check
      .mockReturnValueOnce(false) // new password differs

    const event = {
      headers: { authorization: makeAuthHeader('ricardo', 'correctPass') },
      body: JSON.stringify({ email: 'dup@example.com', password: 'newPass' })
    }

    const result = await handler(event)
    expect(result.statusCode).toBe(422)
    expect(JSON.parse(result.body).error).toBe('Duplicate')
    expect(DynamoDBDocumentClient.prototype.send).toHaveBeenCalledTimes(2)

    spy.mockRestore()
  })

  test('returns 500 when DynamoDB throws generic error', async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})

    DynamoDBDocumentClient.prototype.send
      .mockResolvedValueOnce({ Item: { PK: 'USER#ricardo', SK: 'METADATA', password: 'storedHash', email: 'old@example.com' } })
      .mockRejectedValueOnce(new Error('boom'))
    bcrypt.compareSync
      .mockReturnValueOnce(true)  // current password check
      .mockReturnValueOnce(false) // new password differs

    const event = {
      headers: { authorization: makeAuthHeader('ricardo', 'correctPass') },
      body: JSON.stringify({ email: 'new@example.com' })
    }
    const result = await handler(event)
    expect(result.statusCode).toBe(500)
    expect(JSON.parse(result.body).error).toBe('DatabaseUpdateError')
    expect(DynamoDBDocumentClient.prototype.send).toHaveBeenCalledTimes(2)

    spy.mockRestore()
  })
})
