// Map client filter keys to DynamoDB attribute names
const filterMap = {
  username: "username",
  trackFav: "trackFav",
  level: "trackLevel",
  activity: "trackType",
  country: "trackRegionTags[0]",
  region: "trackRegionTags[1]"
}

const matches = (item, condition) => {
  return Object.entries(condition).every(([key, value]) => {
    const dbKey = filterMap[key]
    if (!dbKey) return true // ignore unknown filters

    // Special case: country/region inside trackRegionTags
    if (dbKey.startsWith("trackRegionTags[")) {
      const idx = parseInt(dbKey.match(/\[(\d+)\]/)[1], 10)
      return item.trackRegionTags && item.trackRegionTags[idx] === value
    }

    // Special case: activity is a comma‑separated list of trackTypes
    if (key === "activity") {
      const values = value.split(",").map(v => v.trim())
      return values.includes(item[dbKey])
    }

    // General case: arrays
    if (Array.isArray(item[dbKey])) {
      return item[dbKey].includes(value)
    }

    // Default: strict equality
    return item[dbKey] === value
  })
}

export const applyFilters = (items, filter) => {
  if (!filter || Object.keys(filter).length === 0) return items

  if (filter.and) {
    return items.filter(item =>
      filter.and.every(cond => matches(item, cond))
    )
  }

  if (filter.or) {
    return items.filter(item =>
      filter.or.some(cond => matches(item, cond))
    )
  }

  // Flat filter object
  return items.filter(item => matches(item, filter))
}
