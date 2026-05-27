const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");
const simpleImportSort = require("eslint-plugin-simple-import-sort");

module.exports = defineConfig([
  ...raycastConfig,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
]);
