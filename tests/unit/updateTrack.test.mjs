import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { handler } from '../../functions/tracks/updateTrack.mjs'

// ✅ Mock verifyJwt to always succeed
jest.mock('../../functions/utils/auth.mjs', () => ({
  verifyJwt: jest.fn(() => ({ sub: 'ricardo' }))
}))

const ddbMock = mockClient(DynamoDBDocumentClient)
const s3Mock = mockClient(S3Client)

beforeEach(() => {
  ddbMock.reset()
  s3Mock.reset()
})

test('returns 404 if track not found', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined })

  const body = { trackId: 'abc123' }

  const response = await handler({ body: JSON.stringify(body) })
  expect(response.statusCode).toBe(404)
})

test('updates track and deletes old thumbnails', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      PK: 'TRACK#abc123',
      SK: 'METADATA',
      trackId: 'abc123',
      trackLatLng: [45, -122],
      trackGeoHash: 'geo123',
      trackGPX: 'file.gpx',
      createdDate: '2024-01-01T00:00:00Z',
      trackPhotos: [{}, {}, {}] // length 3
    }
  })

  s3Mock.on(PutObjectCommand).resolves({})
  s3Mock.on(DeleteObjectCommand).resolves({})
  ddbMock.on(TransactWriteCommand).resolves({})

  const longDataUrl = 'data:image/jpeg;base64,' + 'a'.repeat(60)

  const body = {
    trackId: 'abc123',
    trackPhotos: [
      {
        picName: '0',
        picThumb: '0',
        picCaption: 'Caption0',
        picThumbDataUrl: longDataUrl
      },
      {
        picName: '1',
        picThumb: '1',
        picCaption: 'Caption1',
        picThumbDataUrl: longDataUrl
      }
    ]
  }

  const response = await handler({ body: JSON.stringify(body) })
  expect(response.statusCode).toBe(200)

  expect(s3Mock.commandCalls(PutObjectCommand).length).toBe(2)

  const deletes = s3Mock.commandCalls(DeleteObjectCommand)
  expect(deletes.length).toBe(1)
  expect(deletes[0].args[0].input.Key).toBe('abc123/thumbnails/2.jpg')

  expect(ddbMock.commandCalls(TransactWriteCommand).length).toBe(1)
})

test('handles DynamoDB error gracefully', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      PK: 'TRACK#abc123',
      SK: 'METADATA',
      trackId: 'abc123',
      trackLatLng: [45, -122],
      trackGeoHash: 'geo123',
      trackGPX: 'file.gpx',
      createdDate: '2024-01-01T00:00:00Z',
      trackPhotos: []
    }
  })
  ddbMock.on(TransactWriteCommand).rejects(new Error('DDB failure'))

  const body = { trackId: 'abc123' }

  const response = await handler({ body: JSON.stringify(body) })
  expect(response.statusCode).toBe(500)
})
