// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  // Formatting is Prettier's job (repo root .prettierrc.json) — turn off overlapping rules.
  prettierConfig,
  {
    ignores: [
      'dist/*',
      'ios/*',
      'android/*',
      'coverage/*',
      '.expo/*',
      'e2e/**/playwright-report/*',
    ],
  },
  {
    rules: {
      // Web-only concern: it guards against stray quotes in HTML text. React
      // Native <Text> renders string children literally, so "it's" is correct.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // jest.mock() factories must use require() — they're hoisted above imports.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'jest.setup.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['scripts/**/*.js', '*.config.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
      },
    },
  },
]);
