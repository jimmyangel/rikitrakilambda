import sanitizeHtml from 'sanitize-html'

export const sanitize = (dirty, restricted) => {
    // Normalize nullish or non-string values
    if (dirty === undefined || dirty === null) return ""

    // Coerce everything to string
    const safe = String(dirty)

    // Sanitize
    const clean = sanitizeHtml(
        safe,
        restricted
            ? { allowedTags: [], allowedAttributes: [] }
            : { allowedTags: ['a', 'li'], allowedAttributes: { 'a': ['href', 'target'] } }
    )

    // Guarantee a string return
    return clean || ""
}

export function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371 // km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2

    return 2 * R * Math.asin(Math.sqrt(a))
}
