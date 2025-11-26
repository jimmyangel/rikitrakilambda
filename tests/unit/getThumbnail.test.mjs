import { mockClient } from "aws-sdk-client-mock"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { Readable } from "stream"
import { handler } from "../../functions/getThumbnail.mjs"

const s3Mock = mockClient(S3Client)

beforeEach(() => {
    s3Mock.reset()
    process.env.BUCKET_NAME = "test-bucket"
})

test("returns 200 with base64 body when thumbnail is found", async () => {
    // Mock S3 to return a stream with image data
    const imageBuffer = Buffer.from("mockImage")
    s3Mock.on(GetObjectCommand).resolves({
    Body: Readable.from([imageBuffer]),
    ETag: "etag123",
    LastModified: new Date("2025-11-25T12:00:00Z")
    })

    const response = await handler({ pathParameters: { trackId: "t1", picIndex: "0" } })

    expect(response.statusCode).toBe(200)
    expect(response.headers["Content-Type"]).toBe("image/jpeg")
    expect(response.headers["ETag"]).toBe("etag123")
    expect(response.headers["Last-Modified"]).toBe("Tue, 25 Nov 2025 12:00:00 GMT")
    expect(response.headers["Cache-Control"]).toBe("public, max-age=86400")
    expect(response.isBase64Encoded).toBe(true)
    expect(response.body).toBe(imageBuffer.toString("base64"))
})

test("returns 404 when S3 throws error", async () => {
    // Suppress console.error for this test
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})

    s3Mock.on(GetObjectCommand).rejects(new Error("S3 failure"))

    const response = await handler({ pathParameters: { trackId: "t1", picIndex: "0" } })

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ error: "Thumbnail not found" })

    spy.mockRestore()
})