import { buildTracksQuery } from "../../functions/utils/queryPlanner.mjs"

test("uses TracksByUser index when username filter provided", () => {
  const query = buildTracksQuery({ username: "alice" })
  expect(query.IndexName).toBe("TracksByUser")
  expect(query.ExpressionAttributeValues[":pk"]).toBe("alice")
})

test("uses TracksByRegion index when region filter provided", () => {
  const query = buildTracksQuery({ region: "Oregon" })
  expect(query.IndexName).toBe("TracksByRegion")
  expect(query.ExpressionAttributeValues[":pk"]).toBe("Oregon")
})

test("defaults to TracksByDate when no filter provided", () => {
  const query = buildTracksQuery({})
  expect(query.IndexName).toBe("TracksByDate")
  expect(query.ExpressionAttributeValues[":pk"]).toBe("TRACKS")
})