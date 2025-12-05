import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import geohash from 'ngeohash'
import { validate } from '../utils/schemaValidator.mjs'
import { sanitize } from '../utils/utils.mjs'
import * as logger from '../utils/logger.mjs'
import { corsHeaders, messages } from '../utils/config.mjs'
import { verifyJwt } from '../utils/auth.mjs'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})

export const handler = async (event, context) => {
  try {
    let body
    try {
      body = JSON.parse(event.body)
    } catch (err) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'InvalidBody' })
      }
    }

    // Validate JWT
    const jwtResult = verifyJwt(event, body.username)
    if (jwtResult.statusCode) {
      return jwtResult
    }

    // Validate body against schema
    const { valid, errors } = validate('trackSchema', body)
    if (!valid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'InvalidInput', description: errors })
      }
    }

    const trackId = nanoid(7)
    const username = jwtResult.sub

    // Sanitize text fields
    body.trackName = sanitize(body.trackName, true)
    body.trackDescription = sanitize(body.trackDescription)
    body.trackRegionTags = body.trackRegionTags.map(tag => sanitize(tag, true))

    // Replace GeoJson with GeoHash
    const [lat, lon] = body.trackLatLng
    const trackGeoHash = geohash.encode(lat, lon)

    // --- GPX upload first ---
    if (body.trackGPXBlob) {
      const gpxKey = `${trackId}/gpx/${body.trackGPX}`
      await s3.send(new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,   // configure this bucket in env
        Key: gpxKey,
        Body: body.trackGPXBlob,
        ContentType: 'application/gpx+xml'
      }))
    }

    // Transaction items
    const transactItems = []

    // Track metadata
    transactItems.push({
      Put: {
        TableName: process.env.TABLE_NAME,
        Item: {
          PK: `TRACK#${trackId}`,
          SK: 'METADATA',
          trackId,
          username,
          // isDraft: true, // This is not really needed
          trackGeoHash,
          trackLatLng: body.trackLatLng,
          trackRegionTags: body.trackRegionTags,
          trackLevel: body.trackLevel,
          trackType: body.trackType,
          trackFav: body.trackFav,
          trackGPX: body.trackGPX,
          trackName: body.trackName,
          trackDescription: body.trackDescription,
          hasPhotos: body.hasPhotos,
          isDeleted: false,
          createdDate: new Date().toISOString(),
          tracksIndexPK: 'TRACKS',
          tracksIndexUserPK: `TRACKS#${username}`
        },
        ConditionExpression: 'attribute_not_exists(PK)'
      }
    })

    // Photos
    if (body.trackPhotos) {
      for (let i = 0; i < body.trackPhotos.length; i++) {
        const photo = body.trackPhotos[i]
        const buffer = Buffer.from(photo.picThumbDataUrl.split(',')[1], 'base64')
        const thumbKey = `${trackId}/thumbnails/${i}.jpg`

        await s3.send(new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: thumbKey,
          Body: buffer,
          ContentType: 'image/jpeg'
        }))

        transactItems.push({
          Put: {
            TableName: process.env.TABLE_NAME,
            Item: {
              PK: `TRACK#${trackId}`,
              SK: `PHOTO#${i}`,
              photoIndex: photo.photoIndex,
              picName: photo.picName,
              picThumb: photo.picThumb,
              picCaption: sanitize(photo.picCaption),
              createdDate: new Date().toISOString(),
              ...(photo.picLatLng ? { picLatLng: photo.picLatLng } : {})
            }
          }
        })
      }
    }

    // Region tags
    for (let i = 0; i < body.trackRegionTags.length; i++) {
      const tag = body.trackRegionTags[i]
      transactItems.push({
        Put: {
          TableName: process.env.TABLE_NAME,
          Item: {
            PK: `TRACK#${trackId}`,
            SK: `REGION#${i}#${tag}`,
            trackId,
            trackRegionTag: tag,
            regionIndex: i,
            trackName: body.trackName,
            trackType: body.trackType,
            trackLevel: body.trackLevel,
            username,
            trackFav: body.trackFav,
            isDeleted: false,
            trackRegionTags: body.trackRegionTags,
            trackLatLng: body.trackLatLng,
            createdDate: new Date().toISOString()
          }
        }
      })
    }

    // Execute transaction
    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }))

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ trackId })
    }
  } catch (err) {
    logger.error(messages.ERROR_DB_TRACK, { err: { message: err.message } }, context)
    return {
      statusCode: 507,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'DatabaseInsertError', description: err.message })
    }
  }
}
