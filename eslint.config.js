// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'desktop/**', 'desktop-lite/**', 'src/parsers/pdf/extractorHtml.generated.ts', '__tests__/fixtures/**'],
  },
]);
