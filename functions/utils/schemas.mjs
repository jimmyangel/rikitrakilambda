export const schemas = {
    userProfileUpdateSchema: {
        type: 'object',
        properties: {
            email: {type: 'string', format: 'email'},
            password: { type: 'string', pattern: "^[^~,;%`'\"<>{}()/]*$", minLength: 6, maxLength: 18 }
        },
        additionalProperties: false
    },
    userRegistrationSchema: {
        type: 'object',
        properties: {
            username: {
                type: 'string',
                pattern: '^[^~,%`;\'"<>{}()[\\]/]*$',
                minLength: 6,
                maxLength: 40
            },
            email: { type: 'string', format: 'email' },
            password: {
                type: 'string',
                pattern: '^[^~,%`;\'"<>{}()[\\]/]*$',
                minLength: 6,
                maxLength: 18
            },
            rturl: { type: 'string', format: 'uri' }
        },
        additionalProperties: false,
        required: ['username', 'email', 'password']
    }
}