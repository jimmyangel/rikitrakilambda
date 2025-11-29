export const schemas = {
  userProfileUpdateSchema: {
    type: 'object',
    properties: {
        email: {type: 'string', format: 'email'},
        password: { type: 'string', pattern: "^[^~,;%`'\"<>{}()/]*$", minLength: 6, maxLength: 18 }
    },
    additionalProperties: false
  }
}