import sanitizeHtml from 'sanitize-html'

export const sanitize = (dirty, restricted) => {
    if (dirty) {
        var clean = sanitizeHtml(dirty, restricted ? {allowedTags: [], allowedAttributes: []} : {allowedTags: ['a', 'li'], allowedAttributes: {'a': [ 'href', 'target' ]}});
        return clean;
    }
}