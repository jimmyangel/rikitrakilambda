export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.m?js$": "babel-jest"
  },
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["js", "mjs"],
  // 👇 This is the key addition
  moduleDirectories: ["node_modules", "functions/node_modules"]
}