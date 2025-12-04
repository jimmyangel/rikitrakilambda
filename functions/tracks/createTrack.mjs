import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import geohash from 'ngeohash'
import { validate } from '../utils/schemaValidator.mjs'
import { sanitize } from '../utils/utils.mjs'
import  *  as logger from "../utils/logger.mjs"
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

    // Validate JWT against body.username
    const jwtResult = verifyJwt(event, username)

    if (jwtResult.statusCode) {
      // Early return if helper produced an error response
      return jwtResult
    }

    // Validate body against schema
    const { valid, errors } = validate('trackSchema', body)
    if (!valid) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'InvalidInput', description: errors }) }
    }

    logger.info('before nanoid')
    const trackId = nanoid(7)
    // Assign username from token
    const username = jwtResult.sub

    // Sanitize text fields
    logger.info('before sanitize')
    body.trackName = sanitize(body.trackName, true)
    body.trackDescription = sanitize(body.trackDescription)
    body.trackRegionTags = body.trackRegionTags.map(tag => sanitize(tag, true))
    logger.info('after sanitize')

    // Replace GeoJson with GeoHash
    const [lat, lon] = body.trackLatLng
    logger.info('before geohash')
    const trackGeoHash = geohash.encode(lat, lon)
    logger.info('after geohash')

    // Transaction items
    const transactItems = []

    // Track metadata
    transactItems.push({
      Put: {
        TableName: process.env.TABLE_NAME,
        Item: {
          PK: `TRACKS#${trackId}`,
          SK: 'METADATA',
          trackId,
          username,
          isDraft: true,
          trackGeoHash,
          trackName: body.trackName,
          trackDescription: body.trackDescription,
          createdDate: new Date().toISOString(),
          trackLatLng: body.trackLatLng
        },
        ConditionExpression: 'attribute_not_exists(PK)'
      }
    })

    // Photos
    if (body.trackPhotos) {
      for (let i = 0; i < body.trackPhotos.length; i++) {
        const photo = body.trackPhotos[i]

        // Upload thumbnail to S3
        const buffer = Buffer.from(photo.picThumbDataUrl.split(',')[1], 'base64')
        const s3Key = `${trackId}/thumbnails/${i}.jpg`

        logger.info('before S3')
        await s3.send(new PutObjectCommand({
          Bucket: process.env.THUMBNAIL_BUCKET,
          Key: s3Key,
          Body: buffer,
          ContentType: 'image/jpeg'
        }))
        logger.info('after S3')


        // Add photo metadata record
        transactItems.push({
          Put: {
            TableName: process.env.TABLE_NAME,
            Item: {
              PK: `TRACKS#${trackId}`,
              SK: `PHOTO#${i}`,
              picUrl: photo.picUrl,
              picDescription: sanitize(photo.picDescription),
              createdDate: new Date().toISOString(),
            }
          }
        })
      }
    }

    // Region tags
    for (let i = 0; i < body.trackRegionTags.length; i++) {
      const region = body.trackRegionTags[i]

      transactItems.push({
        Put: {
          TableName: process.env.TABLE_NAME,
          Item: {
            PK: `TRACKS#${trackId}`,
            SK: `REGION#${i}#${region}`,
            username,
            createdDate: new Date().toISOString()
          }
        }
      })
    }

    // Execute transaction
    logger.info('before ddb.send')
    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }))

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ trackId })
    }

  } catch (err) {
    logger.error('createTrack error', err)
    return {
      statusCode: 507,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'DatabaseInsertError', description: err.message })
    }
  }
}
