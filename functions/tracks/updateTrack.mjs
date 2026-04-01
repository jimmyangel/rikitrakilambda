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
    // ---------- Parse body ----------
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

    // ---------- JWT ----------
    const jwtResult = verifyJwt(event)
    if (jwtResult.statusCode) return jwtResult

    const username = jwtResult.sub
    const tokenIsAdmin = jwtResult.isAdmin === true

    // ---------- Schema validation ----------
    const { valid, errors } = validate('trackEditSchema', body)
    if (!valid) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'InvalidInput', description: errors })
      }
    }

    const trackId = body.trackId

    // ---------- Load existing METADATA ----------
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

    // ---------- Determine admin status ----------
    let isAdmin = false

    if (tokenIsAdmin) {
      const userResp = await ddb.send(new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { PK: `USER#${username}`, SK: 'METADATA' }
      }))
      isAdmin = userResp.Item?.isAdmin === true
    }

    // ---------- Ownership check (skip if admin) ----------
    if (!isAdmin && existingMetadata.username !== username) {
      return {
        statusCode: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Forbidden',
          description: 'You do not own this track.'
        })
      }
    }

    // ---------- Sanitize incoming fields ----------
    const incomingTrackName =
      body.trackName != null ? sanitize(body.trackName, true) : existingMetadata.trackName

    const incomingTrackDescription =
      body.trackDescription != null ? sanitize(body.trackDescription) : existingMetadata.trackDescription

    const incomingTrackRegionTags =
      Array.isArray(body.trackRegionTags)
        ? body.trackRegionTags.map(tag => sanitize(tag, true))
        : existingMetadata.trackRegionTags || []

    // ---------- Photos / thumbnails ----------
    let finalPhotos = existingMetadata.trackPhotos || []

    if (Array.isArray(body.trackPhotos)) {
      const incomingPhotos = []

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
          picCaption: sanitize(photo.picCaption)
        }

        if (photo.picIndex != null) entry.picIndex = photo.picIndex
        if (Array.isArray(photo.picLatLng)) entry.picLatLng = photo.picLatLng
        if (photo.createdDate) entry.createdDate = photo.createdDate

        incomingPhotos.push(entry)
      }

      // Delete thumbnails if array shrank
      const oldLength = finalPhotos.length
      const newLength = incomingPhotos.length
      if (newLength < oldLength) {
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

      finalPhotos = incomingPhotos
    }

    // ---------- Build updated METADATA ----------
    const updatedMetadata = {
      ...existingMetadata,
      trackName: incomingTrackName,
      trackDescription: incomingTrackDescription,
      trackType: body.trackType ?? existingMetadata.trackType,
      trackLevel: body.trackLevel ?? existingMetadata.trackLevel,
      trackFav: body.trackFav ?? existingMetadata.trackFav,
      trackRegionTags: incomingTrackRegionTags,
      trackPhotos: finalPhotos,
      hasPhotos: finalPhotos.length > 0,
      updatedDate: new Date().toISOString(),
      tracksIndexPK: 'TRACKS',
      tracksIndexUserPK: `TRACKS#${existingMetadata.username}`
    }

    const transactItems = []

    // ---------- Put updated METADATA ----------
    transactItems.push({
      Put: {
        TableName: process.env.TABLE_NAME,
        Item: updatedMetadata,
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
      }
    })

    // ---------- SK-set diffing for REGION# items ----------
    const oldTags = existingMetadata.trackRegionTags || []
    const newTags = incomingTrackRegionTags || []

    const oldSkSet = new Set()
    const newSkSet = new Set()

    for (let i = 0; i < oldTags.length; i++) {
      oldSkSet.add(`REGION#${i}#${oldTags[i]}`)
    }

    for (let i = 0; i < newTags.length; i++) {
      newSkSet.add(`REGION#${i}#${newTags[i]}`)
    }

    // Deletes
    for (let i = 0; i < oldTags.length; i++) {
      const sk = `REGION#${i}#${oldTags[i]}`
      if (!newSkSet.has(sk)) {
        transactItems.push({
          Delete: {
            TableName: process.env.TABLE_NAME,
            Key: { PK: `TRACK#${trackId}`, SK: sk }
          }
        })
      }
    }

    // Inserts
    for (let i = 0; i < newTags.length; i++) {
      const sk = `REGION#${i}#${newTags[i]}`
      if (!oldSkSet.has(sk)) {
        transactItems.push({
          Put: {
            TableName: process.env.TABLE_NAME,
            Item: {
              PK: `TRACK#${trackId}`,
              SK: sk,
              trackId,
              trackRegionTag: newTags[i],
              regionIndex: i,
              trackName: updatedMetadata.trackName,
              trackType: updatedMetadata.trackType,
              trackLevel: updatedMetadata.trackLevel,
              username: updatedMetadata.username,
              trackFav: updatedMetadata.trackFav,
              isDeleted: false,
              trackRegionTags: newTags,
              trackLatLng: updatedMetadata.trackLatLng,
              createdDate: updatedMetadata.createdDate
            }
          }
        })
      }
    }

    // Updates
    for (let i = 0; i < newTags.length; i++) {
      const sk = `REGION#${i}#${newTags[i]}`
      if (oldSkSet.has(sk) && newSkSet.has(sk)) {
        transactItems.push({
          Put: {
            TableName: process.env.TABLE_NAME,
            Item: {
              PK: `TRACK#${trackId}`,
              SK: sk,
              trackId,
              trackRegionTag: newTags[i],
              regionIndex: i,
              trackName: updatedMetadata.trackName,
              trackType: updatedMetadata.trackType,
              trackLevel: updatedMetadata.trackLevel,
              username: updatedMetadata.username,
              trackFav: updatedMetadata.trackFav,
              isDeleted: false,
              trackRegionTags: newTags,
              trackLatLng: updatedMetadata.trackLatLng,
              createdDate: updatedMetadata.createdDate
            }
          }
        })
      }
    }

    // ---------- Execute transaction ----------
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
      body: JSON.stringify({
        error: 'DatabaseUpdateError',
        description: err.message
      })
    }
  }
}
