'use strict';

module.exports = {
  testEnvironment: 'node',
  // The HTTP server entry point is excluded: it is exercised by the deploy
  // stage's health check, not by unit tests.
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 80,
      functions: 90,
      lines: 90,
    },
  },
  reporters: [
    'default',
    // JUnit XML consumed by the `junit` step in the Jenkinsfile.
    ['jest-junit', { outputDirectory: 'reports/junit', outputName: 'junit.xml', className: 'task-api' }],
  ],
  testPathIgnorePatterns: ['/node_modules/'],
};
