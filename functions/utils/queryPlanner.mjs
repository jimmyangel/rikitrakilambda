// Shared query planner for getTracks and getNumberOfTracks
export function buildTracksQuery(filter, limit = 5000) {
  let indexName, keyName, keyValue

  if (filter.username) {
    indexName = 'TracksByUser'
    keyName = 'tracksIndexUserPK'
    keyValue = `TRACKS#${filter.username}`
  } else if (filter.country || filter.region) {
    const regions = (filter.region || filter.country).split(',').map(s => s.trim())
    indexName = 'TracksByRegion'
    keyName = 'trackRegionTag'
    keyValue = regions[0] // driving key
  } else if (filter.activity) {
    const activities = filter.activity.split(',').map(s => s.trim())
    indexName = 'TracksByType'
    keyName = 'trackType'
    keyValue = activities[0] // driving key
  } else if (filter.level) {
    const levels = filter.level.split(',').map(s => s.trim())
    indexName = 'TracksByLevel'
    keyName = 'trackLevel'
    keyValue = levels[0] // driving key
  } else {
    indexName = 'TracksByDate'
    keyName = 'tracksIndexPK'
    keyValue = 'TRACKS'
  }

  return {
    TableName: process.env.TABLE_NAME,
    IndexName: indexName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': keyName },
    ExpressionAttributeValues: {
      ':pk': keyValue,
      ':false': false
    },
    FilterExpression: 'attribute_not_exists(isDeleted) OR isDeleted = :false',
    Select: 'ALL_ATTRIBUTES', // always return items; caller can override if needed
    Limit: limit
  }
}
