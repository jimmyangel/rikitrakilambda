// Internal mapping: client filter keys → DynamoDB attributes
const filterMap = {
  username: "username",
  trackFav: "trackFav",
  level: "trackLevel",
  activity: "trackType",
  country: "trackRegionTags[0]",
  region: "trackRegionTags[1]"
}

// Helper: check if filter contains any mapped keys
export const hasExtraFilters = (filter) => {
  if (!filter) return false
  return Object.keys(filter).some(key => filterMap[key])
}

const matches = (item, condition) => {
  return Object.entries(condition).every(([key, value]) => {
    const dbKey = filterMap[key]
    if (!dbKey) return true // ignore unknown filters

    // Special case: country/region inside trackRegionTags
    if (key === "country" || key === "region") {
      return item.trackRegionTags && item.trackRegionTags.includes(value)
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

  let filtered

  if (filter.and) {
    filtered = items.filter(item =>
      filter.and.every(cond => matches(item, cond))
    )
  } else if (filter.or) {
    filtered = items.filter(item =>
      filter.or.some(cond => matches(item, cond))
    )
  } else {
    filtered = items.filter(item => matches(item, filter))
  }

  return filtered
}
