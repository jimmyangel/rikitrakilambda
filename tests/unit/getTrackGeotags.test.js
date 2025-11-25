import { mockClient } from "aws-sdk-client-mock"
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { handler } from "../../functions/getTrackGeotags.mjs"
import { Readable } from "stream"

// Create mocks for both clients
const ddbMock = mockClient(DynamoDBDocumentClient)
const s3Mock = mockClient(S3Client)

beforeEach(() => {
    ddbMock.reset()
    s3Mock.reset()
})

test("returns 404 if no items", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] })

    const response = await handler({ pathParameters: { trackId: "S1o8dr6j0" } })
    expect(response.statusCode).toBe(404)
})

test("returns trackPhotos array if found", async () => {
    ddbMock.on(QueryCommand).resolves({
        Items: [
            {
                picLatLng: [ 45.402877777777775, -121.77648055555555 ],
                trackId: 'S1o8dr6j0',
                picCaption: 'Mt Adams',
                photoIndex: 0,
                picName: '0',
                picThumb: '0',
                PK: 'TRACK#S1o8dr6j0',
                SK: 'PHOTO#0'
            }
        ]
    })

    s3Mock.on(GetObjectCommand).resolves({
        Body: Readable.from([Buffer.from("mockImage")])
    })

    const response = await handler({ pathParameters: { trackId: "S1o8dr6j0" } })
    expect(response.statusCode).toBe(200)

    const body = JSON.parse(response.body)
    expect(body.geoTags.trackId).toBe("S1o8dr6j0")
    expect(body.geoTags.trackPhotos).toHaveLength(1)
    expect(body.geoTags.trackPhotos[0]).toMatchObject(
        {
            picLatLng: [ 45.402877777777775, -121.77648055555555 ],
            picCaption: 'Mt Adams',
            picName: '0',
            picThumb: '0',
        }
    )
})

test("handles DynamoDB error gracefully", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    ddbMock.on(QueryCommand).rejects(new Error("DDB failure"))

    const response = await handler({ pathParameters: { trackId: "S1o8dr6j0" } })
    expect(response.statusCode).toBe(500)
    spy.mockRestore()
})
