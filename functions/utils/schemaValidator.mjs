import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { schemas } from './schemas.mjs'

const ajv = new Ajv({ allErrors: true })
addFormats(ajv)

const compiled = {}
for (const [name, schema] of Object.entries(schemas)) {
  compiled[name] = ajv.compile(schema)
}

export const validate = (schemaName, data) => {
  const fn = compiled[schemaName]
  const valid = fn(data)
  return { valid, errors: fn.errors }
}