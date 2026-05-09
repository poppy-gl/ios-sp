const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');
const eslintPluginPrettier = require('eslint-plugin-prettier/recommended');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  eslintConfigPrettier,
  eslintPluginPrettier,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
]);
