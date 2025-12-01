export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,Origin,Accept",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT"
}

export const messages = {
  ERROR_TRACKS_QUERY: 'Error querying Tracks',
  ERROR_MOTD_TRACKS: "Error querying MOTD tracks",
  ERROR_INTERNAL: 'Internal server error',
  ERROR_COUNT_TRACKS: 'Failed to count tracks',
  ERROR_FETCH_PIC: 'Error fetching picture',
  ERROR_FETCH_THUMB: 'Error fetching thumbnail',
  ERROR_FETCH_GEOTAGS: 'Error in fetching track geotags',
  ERROR_FETCH_GPX: 'Error fetching GPX file',
  ERROR_DB: 'Cannot connect to database',
  WARN_NO_PHOTOS_FOR_TRACK: 'No photos found for track',
  WARN_ACCT_NOT_ACTIVE: 'account not activated',
  WARN_INVALID_TOKEN: 'Missing or invalid token',
  WARN_USER_NOT_FOUND: 'username not found',
  WARN_EMAIL_EXISTS: 'Email already exists',
  WARN_INVALID_AUTH: 'Missing or invalid auth header',
  WARN_INVALID_PASSWORD: 'Invalid password',
  WARN_NO_DATA: 'No data',
  WARN_INVALID_INPUT: 'Invalid input'
}