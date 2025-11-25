import { applyFilters } from "../../functions/utils/applyFilters.mjs"
import tracks from "../fixtures/tracks.json"

test("filters by username", () => {
  const result = applyFilters(tracks, { username: "alice" })
  expect(result).toHaveLength(1)
  expect(result[0].username).toBe("alice")
})

test("filters by region unordered", () => {
  const result = applyFilters(tracks, { country: "US", region: "Oregon" })
  expect(result).toHaveLength(2) // alice and carol both match
})

test("filters by activity list", () => {
  const result = applyFilters(tracks, { activity: "Cycling,Running" })
  expect(result).toHaveLength(2) // bob and carol
})

test("handles unordered region/country tags", () => {
  const result = applyFilters(tracks, { country: "US", region: "Oregon" })
  expect(result).toHaveLength(2) // alice and carol both match
})

test("returns empty when filters conflict", () => {
  const result = applyFilters(tracks, { username: "alice", region: "California" })
  expect(result).toHaveLength(0)
})

test("filters by favorites", () => {
  const result = applyFilters(tracks, { trackFav: true })
  expect(result.every(t => t.trackFav)).toBe(true)
})



