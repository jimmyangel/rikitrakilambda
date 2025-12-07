import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { validate } from '../utils/schemaValidator.mjs'
import { sanitize } from '../utils/utils.mjs'
import * as logger from '../utils/logger.mjs'
import { corsHeaders, messages } from '../utils/config.mjs'
import { verifyJwt } from '../utils/auth.mjs'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})

export const handler = async (event, context) => {
  try {
    // Parse body
    let body
    try {
      body = JSON.parse(event.body)
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'InvalidBody' })
      }
    }

    // Validate JWT
    const jwtResult = verifyJwt(event)
    if (jwtResult.statusCode) return jwtResult
    const username = jwtResult.sub

    // Validate body against schema
    const { valid, errors } = validate('trackEditSchema', body)
    if (!valid) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'InvalidInput', description: errors })
      }
    }

    const trackId = body.trackId

    // Fetch existing METADATA
    const existingResp = await ddb.send(new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `TRACK#${trackId}`, SK: 'METADATA' }
    }))
    const existingMetadata = existingResp.Item
    if (!existingMetadata) {
      return {
        statusCode: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'TrackNotFound' })
      }
    }

    // Sanitize only if present
    const incomingTrackName = body.trackName != null ? sanitize(body.trackName, true) : undefined
    const incomingTrackDescription = body.trackDescription != null ? sanitize(body.trackDescription) : undefined
    const incomingTrackRegionTags = Array.isArray(body.trackRegionTags)
      ? body.trackRegionTags.map(tag => sanitize(tag, true))
      : undefined

    // Build incoming trackPhotos (only if provided), upload thumbnails
    let incomingPhotos = undefined
    if (Array.isArray(body.trackPhotos)) {
      incomingPhotos = []
      for (let i = 0; i < body.trackPhotos.length; i++) {
        const photo = body.trackPhotos[i]

        if (photo.picThumbDataUrl) {
          const buffer = Buffer.from(photo.picThumbDataUrl.split(',')[1], 'base64')
          const thumbKey = `${trackId}/thumbnails/${i}.jpg`
          await s3.send(new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: thumbKey,
            Body: buffer,
            ContentType: 'image/jpeg'
          }))
        }

        const entry = {
          picName: photo.picName,
          picThumb: photo.picThumb,
          picCaption: sanitize(photo.picCaption),
          picIndex: i
        }
        if (Array.isArray(photo.picLatLng)) entry.picLatLng = photo.picLatLng
        if (photo.createdDate) entry.createdDate = photo.createdDate
        incomingPhotos.push(entry)
      }
    }

    // Decide final photos: prefer incoming if provided, else keep existing
    const finalPhotos = incomingPhotos != null ? incomingPhotos : (existingMetadata.trackPhotos || [])
    const oldLength = existingMetadata.trackPhotos?.length ?? 0
    const newLength = finalPhotos.length

    // Cleanup old thumbnails if final array is shorter than existing
    if (incomingPhotos != null && newLength < oldLength) {
      for (let i = newLength; i < oldLength; i++) {
        const deleteKey = `${trackId}/thumbnails/${i}.jpg`
        try {
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: deleteKey
          }))
        } catch (err) {
          logger.error('Failed to delete old thumbnail', { key: deleteKey, message: err.message }, context)
        }
      }
    }

    // Merge fields: use incoming when provided, else keep existing
    const finalTrackRegionTags = incomingTrackRegionTags != null
      ? incomingTrackRegionTags
      : (existingMetadata.trackRegionTags || [])

    const updatedMetadata = {
      PK: `TRACK#${trackId}`,
      SK: 'METADATA',
      trackId,
      username,
      trackLatLng: existingMetadata.trackLatLng,
      trackGeoHash: existingMetadata.trackGeoHash,
      trackGPX: existingMetadata.trackGPX,
      createdDate: existingMetadata.createdDate,

      trackRegionTags: finalTrackRegionTags,
      trackLevel: body.trackLevel ?? existingMetadata.trackLevel,
      trackType: body.trackType ?? existingMetadata.trackType,
      trackFav: body.trackFav ?? existingMetadata.trackFav,
      trackName: incomingTrackName ?? existingMetadata.trackName,
      trackDescription: incomingTrackDescription ?? existingMetadata.trackDescription,

      hasPhotos: finalPhotos.length > 0,
      trackPhotos: finalPhotos,

      isDeleted: false,
      updatedDate: new Date().toISOString(),
      tracksIndexPK: 'TRACKS',
      tracksIndexUserPK: `TRACKS#${username}`
    }

    // Build transaction (replace strategy for region tags, but skip duplicates)
    const oldTags = existingMetadata.trackRegionTags || []
    const newTags = finalTrackRegionTags

    const transactItems = []

    // Put updated METADATA
    transactItems.push({
      Put: {
        TableName: process.env.TABLE_NAME,
        Item: updatedMetadata,
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
      }
    })

    // Delete old region entries only if not in newTags
    for (let i = 0; i < oldTags.length; i++) {
      if (!newTags.includes(oldTags[i])) {
        transactItems.push({
          Delete: {
            TableName: process.env.TABLE_NAME,
            Key: { PK: `TRACK#${trackId}`, SK: `REGION#${i}#${oldTags[i]}` }
          }
        })
      }
    }

    // Insert new region entries
    for (let i = 0; i < newTags.length; i++) {
      transactItems.push({
        Put: {
          TableName: process.env.TABLE_NAME,
          Item: {
            PK: `TRACK#${trackId}`,
            SK: `REGION#${i}#${newTags[i]}`,
            trackId,
            trackRegionTag: newTags[i],
            regionIndex: i,
            trackName: updatedMetadata.trackName,
            trackType: updatedMetadata.trackType,
            trackLevel: updatedMetadata.trackLevel,
            username,
            trackFav: updatedMetadata.trackFav,
            isDeleted: false,
            trackRegionTags: newTags,
            trackLatLng: updatedMetadata.trackLatLng,
            updatedDate: updatedMetadata.updatedDate
          }
        }
      })
    }

    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }))

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId })
    }
  } catch (err) {
    logger.error(messages.ERROR_DB_TRACK, { err: { message: err.message } }, context)
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'DatabaseUpdateError', description: err.message })
    }
  }
}
