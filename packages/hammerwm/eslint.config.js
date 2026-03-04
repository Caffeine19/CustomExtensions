/* eslint-disable @typescript-eslint/no-require-imports */
const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");
const reactPlugin = require("eslint-plugin-react");

module.exports = defineConfig([
  ...raycastConfig,
  {
    plugins: {
      react: reactPlugin,
    },
    rules: {
      "react/jsx-first-prop-new-line": ["error", "multiline-multiprop"],
    },
  },
]);
