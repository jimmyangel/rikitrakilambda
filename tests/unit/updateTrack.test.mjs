import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { handler } from '../../functions/tracks/updateTrack.mjs'

// Mock verifyJwt to always succeed
jest.mock('../../functions/utils/auth.mjs', () => ({
  verifyJwt: jest.fn(() => ({ sub: 'ricardo' }))
}))

const ddbMock = mockClient(DynamoDBDocumentClient)
const s3Mock = mockClient(S3Client)

beforeEach(() => {
  ddbMock.reset()
  s3Mock.reset()
})

//
// ------------------------------------------------------------
// 404 when track not found
// ------------------------------------------------------------
test('returns 404 if track not found', async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined })

  const body = { trackId: 'abc123' }
  const response = await handler({ body: JSON.stringify(body) })

  expect(response.statusCode).toBe(404)
})

//
// ------------------------------------------------------------
// Updates photos + deletes old thumbnails
// ------------------------------------------------------------
test('updates track photos and deletes old thumbnails', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      PK: 'TRACK#abc123',
      SK: 'METADATA',
      trackId: 'abc123',
      username: 'ricardo',
      trackLatLng: [45, -122],
      trackGeoHash: 'geo123',
      trackGPX: 'file.gpx',
      createdDate: '2024-01-01T00:00:00Z',
      trackRegionTags: ['oregon', 'forest'],
      trackPhotos: [{}, {}, {}]
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

//
// ------------------------------------------------------------
// METADATA rewrite but no region changes when no region tags provided
// ------------------------------------------------------------
test('rewrites METADATA but does not rebuild region index when region tags not provided', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      PK: 'TRACK#abc123',
      SK: 'METADATA',
      trackId: 'abc123',
      username: 'ricardo',
      trackLatLng: [45, -122],
      trackGeoHash: 'geo123',
      trackGPX: 'file.gpx',
      createdDate: '2024-01-01T00:00:00Z',
      trackRegionTags: ['oregon'],
      trackPhotos: []
    }
  })

  ddbMock.on(TransactWriteCommand).resolves({})

  const body = {
    trackId: 'abc123',
    trackName: 'New Name'
  }

  const response = await handler({ body: JSON.stringify(body) })
  expect(response.statusCode).toBe(200)

  const tx = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems

  // METADATA Put
  expect(tx.some(x => x.Put && x.Put.Item.SK === 'METADATA')).toBe(true)

  // Region index unchanged → only 1 region Put (update)
  const regionPuts = tx.filter(x => x.Put && x.Put.Item.SK.startsWith('REGION'))
  expect(regionPuts.length).toBe(1)

  const regionDeletes = tx.filter(x => x.Delete)
  expect(regionDeletes.length).toBe(0)
})

//
// ------------------------------------------------------------
// SK-set diffing: US, Washington → US, Oregon
// ------------------------------------------------------------
test('SK-set diffing: delete old SKs, insert new SKs, update unchanged SKs', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      PK: 'TRACK#abc123',
      SK: 'METADATA',
      trackId: 'abc123',
      username: 'ricardo',
      trackLatLng: [45, -122],
      trackGeoHash: 'geo123',
      trackGPX: 'file.gpx',
      createdDate: '2024-01-01T00:00:00Z',
      trackRegionTags: ['US', 'Washington'],
      trackPhotos: []
    }
  })

  ddbMock.on(TransactWriteCommand).resolves({})

  const body = {
    trackId: 'abc123',
    trackRegionTags: ['US', 'Oregon']
  }

  const response = await handler({ body: JSON.stringify(body) })
  expect(response.statusCode).toBe(200)

  const tx = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems

  const deletes = tx.filter(x => x.Delete)
  const puts = tx.filter(x => x.Put && x.Put.Item.SK.startsWith('REGION'))

  // DELETE only Washington
  expect(deletes.length).toBe(1)
  expect(deletes[0].Delete.Key.SK).toBe('REGION#1#Washington')

  // INSERT only Oregon
  expect(puts.some(x => x.Put.Item.SK === 'REGION#1#Oregon')).toBe(true)

  // UPDATE US (Put with same SK)
  expect(puts.some(x => x.Put.Item.SK === 'REGION#0#US')).toBe(true)
})

//
// ------------------------------------------------------------
// Reorder: ["US", "Oregon"] → ["Oregon", "US"]
// ------------------------------------------------------------
test('SK-set diffing handles reorder correctly', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      PK: 'TRACK#abc123',
      SK: 'METADATA',
      trackId: 'abc123',
      username: 'ricardo',
      trackLatLng: [45, -122],
      trackGeoHash: 'geo123',
      trackGPX: 'file.gpx',
      createdDate: '2024-01-01T00:00:00Z',
      trackRegionTags: ['US', 'Oregon'],
      trackPhotos: []
    }
  })

  ddbMock.on(TransactWriteCommand).resolves({})

  const body = {
    trackId: 'abc123',
    trackRegionTags: ['Oregon', 'US']
  }

  const response = await handler({ body: JSON.stringify(body) })
  expect(response.statusCode).toBe(200)

  const tx = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems

  const deletes = tx.filter(x => x.Delete)
  const puts = tx.filter(x => x.Put && x.Put.Item.SK.startsWith('REGION'))

  // Old SKs:
  // REGION#0#US
  // REGION#1#Oregon
  //
  // New SKs:
  // REGION#0#Oregon
  // REGION#1#US

  // Both SKs changed → delete 2, insert 2
  expect(deletes.length).toBe(2)
  expect(puts.length).toBe(2)

  expect(puts.some(x => x.Put.Item.SK === 'REGION#0#Oregon')).toBe(true)
  expect(puts.some(x => x.Put.Item.SK === 'REGION#1#US')).toBe(true)
})

//
// ------------------------------------------------------------
// DynamoDB error
// ------------------------------------------------------------
test('handles DynamoDB error gracefully', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      PK: 'TRACK#abc123',
      SK: 'METADATA',
      trackId: 'abc123',
      username: 'ricardo',
      trackLatLng: [45, -122],
      trackGeoHash: 'geo123',
      trackGPX: 'file.gpx',
      createdDate: '2024-01-01T00:00:00Z',
      trackRegionTags: [],
      trackPhotos: []
    }
  })

  ddbMock.on(TransactWriteCommand).rejects(new Error('DDB failure'))

  const body = { trackId: 'abc123', trackName: 'X' }
  const response = await handler({ body: JSON.stringify(body) })

  expect(response.statusCode).toBe(500)
})
