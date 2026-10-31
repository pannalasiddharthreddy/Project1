'use strict';

const globals = require('globals');

// Flat ESLint config (ESLint 9+). Mild, pragmatic rules suitable for a CI gate.
module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'reports/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      'no-async-promise-executor': 'error',
      'no-console': 'warn',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.jest },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
