export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.m?js$': 'babel-jest'
  },
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['js', 'mjs'],
  moduleDirectories: ['node_modules', 'functions/node_modules'],
  transformIgnorePatterns: ['/node_modules/(?!nanoid)']
}
