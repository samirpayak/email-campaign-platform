module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'api/**/*.js',
    '!api/**/*.test.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],
  testTimeout: 10000,
  verbose: true,
  bail: false,
  detectOpenHandles: true
};
