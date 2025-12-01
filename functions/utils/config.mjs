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
  WARN_NO_PHOTOS_FOR_TRACK: 'No photos found for track'
}