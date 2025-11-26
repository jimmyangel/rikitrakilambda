import { mockClient } from "aws-sdk-client-mock"
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { Readable } from "stream"
import { handler } from "../../functions/getTrackGPX.mjs"

const s3Mock = mockClient(S3Client)

beforeEach(() => {
  s3Mock.reset()
  process.env.BUCKET_NAME = "test-bucket"
})

test("returns 200 with base64 GPX when file is found", async () => {
  const gpxBuffer = Buffer.from("<gpx>mock data</gpx>")

  // First call: ListObjectsV2
  s3Mock.on(ListObjectsV2Command).resolves({
    Contents: [{ Key: "t1/GPX/track.gpx" }]
  })

  // Second call: GetObject
  s3Mock.on(GetObjectCommand).resolves({
    Body: Readable.from([gpxBuffer]),
    ETag: "etag123",
    LastModified: new Date("2025-11-25T12:00:00Z")
  })

  const response = await handler({ pathParameters: { trackId: "t1" } })

  expect(response.statusCode).toBe(200)
  expect(response.headers["Content-Type"]).toBe("application/gpx+xml")
  expect(response.headers["ETag"]).toBe("etag123")
  expect(response.headers["Last-Modified"]).toBe("Tue, 25 Nov 2025 12:00:00 GMT")
  expect(response.headers["Cache-Control"]).toBe("public, max-age=86400")
  expect(response.isBase64Encoded).toBe(true)
  expect(response.body).toBe(gpxBuffer.toString("base64"))
})

test("returns 404 when no GPX file is found", async () => {
  s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] })

  const response = await handler({ pathParameters: { trackId: "t1" } })

  expect(response.statusCode).toBe(404)
  expect(JSON.parse(response.body)).toEqual({ error: "GPX file not found" })
})

test("returns 404 when S3 throws error", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {})

  s3Mock.on(ListObjectsV2Command).rejects(new Error("S3 failure"))

  const response = await handler({ pathParameters: { trackId: "t1" } })

  expect(response.statusCode).toBe(404)
  expect(JSON.parse(response.body)).toEqual({ error: "GPX file not found" })

  spy.mockRestore()
})
