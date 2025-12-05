// tests/unit/createTrack.test.mjs
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import jwt from 'jsonwebtoken'
import { handler } from '../../functions/tracks/createTrack.mjs'
import validTrack from '../fixtures/validTrack.json'

// mock sanitize-html
jest.mock('sanitize-html', () => ({
  __esModule: true,
  default: (input) => input
}))

// mock S3 client with shared sendMock
jest.mock('@aws-sdk/client-s3', () => {
  const sendMock = jest.fn()
  class S3Client {
    send = sendMock
  }
  return {
    __esModule: true,
    S3Client,
    PutObjectCommand: jest.fn(),
    __sendMock: sendMock // expose the mock for tests
  }
})

import { __sendMock as s3SendMock, PutObjectCommand } from '@aws-sdk/client-s3'

let ddbSpy, jwtSpy, s3Spy

describe('createTrack handler', () => {
  beforeEach(() => {
    ddbSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    jwtSpy = jest.spyOn(jwt, 'verify')
    s3Spy = s3SendMock
  })

  afterEach(() => {
    jest.restoreAllMocks()
    s3Spy.mockReset()
  })

  it('returns 401 when JWT is missing', async () => {
    jwtSpy.mockImplementation(() => { throw new Error('MissingToken') })
    const event = { headers: {}, body: '{}' }
    const response = await handler(event)
    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body).error).toBe('MissingToken')
  })

  it('returns 400 when body is invalid JSON', async () => {
    jwtSpy.mockReturnValue({ sub: 'ricardo' })
    const event = { headers: { Authorization: 'Bearer sometoken' }, body: '{notjson}' }
    const response = await handler(event, 'ricardo')
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toBe('InvalidBody')
  })

  it('uploads GPX blob to S3 and returns 201 when track is created successfully', async () => {
    jwtSpy.mockReturnValue({ sub: 'ricardo' })
    ddbSpy.mockResolvedValue({}) // fake Dynamo success
    s3Spy.mockResolvedValue({})  // fake S3 success

    const event = {
      headers: { Authorization: 'Bearer sometoken' },
      body: JSON.stringify(validTrack)
    }

    const response = await handler(event)

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.trackId).toBeDefined()
    expect(typeof body.trackId).toBe('string')

    // ensure S3 was called for GPX upload
    expect(s3Spy).toHaveBeenCalled()
    const callArgs = s3Spy.mock.calls[0][0]
    expect(callArgs).toBeInstanceOf(PutObjectCommand)
  })
})
