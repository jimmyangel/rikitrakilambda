// utils/logger.mjs
const baseContext = {
  functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
  functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
  region: process.env.AWS_REGION,
  stage: process.env.STAGE || 'dev'
}

const log = (level, message, extra = {}, context) => {
  console.log(JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    requestId: context?.awsRequestId || 'local-test',
    ...baseContext,
    ...extra
  }))
}

export const info = (message, extra = {}) => log('info', message, extra)
export const warn = (message, extra = {}) => log('warn', message, extra)
export const error = (message, extra = {}) => log('error', message, extra)
export const debug = (message, extra = {}) => log('debug', message, extra)
