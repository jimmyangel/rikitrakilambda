import { corsHeaders } from "../utils/config.mjs"

export const handler = async () => {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: ''
  }
}