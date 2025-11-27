import { handler } from "../../functions/users/getToken.mjs"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb"
import { mockClient } from "aws-sdk-client-mock"

jest.mock("bcryptjs", () => ({
  compareSync: jest.fn()
}))

// Create a stable mock for DocumentClient
const ddbMock = mockClient(DynamoDBDocumentClient)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE",
  "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization"
}

describe("getToken Lambda", () => {
  const baseEvent = {
    headers: {
      Authorization: "Basic " + Buffer.from("alice:password").toString("base64")
    }
  }

  beforeEach(() => {
    ddbMock.reset()
    jest.clearAllMocks()
    process.env.JWT_SECRET = "testsecret"
    process.env.JWT_ISSUER = "myapi"
    process.env.TABLE_NAME = "Users"
  })

  test("returns JWT for valid user", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: "USER#alice", password: "hashed" } })
    bcrypt.compareSync.mockReturnValue(true)

    const res = await handler(baseEvent)
    expect(res.statusCode).toBe(200)
    const decoded = jwt.verify(res.body, process.env.JWT_SECRET)
    expect(decoded.sub).toBe("alice")
  })

  test("returns 401 for invalid password", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: "USER#alice", password: "hashed" } })
    bcrypt.compareSync.mockReturnValue(false)

    const res = await handler(baseEvent)
    expect(res.statusCode).toBe(401)
  })

  test("returns 401 for missing user", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined })

    const res = await handler(baseEvent)
    expect(res.statusCode).toBe(401)
  })

  test("returns 403 for user not activated", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: "USER#alice", password: "hashed", isInactive: true } })
    bcrypt.compareSync.mockReturnValue(true)

    const res = await handler(baseEvent)
    expect(res.statusCode).toBe(403)
  })

  test("returns 500 on DB error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    
    ddbMock.on(GetCommand).rejects(new Error("DB down"))

    const res = await handler(baseEvent)
    expect(res.statusCode).toBe(500)

    spy.mockRestore()
  })
})
