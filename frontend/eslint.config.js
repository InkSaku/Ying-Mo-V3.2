import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const sourceRules = {
  ...js.configs.recommended.rules,
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "error",
  "react-refresh/only-export-components": [
    "error",
    {
      allowConstantExport: true,
      allowExportNames: ["useAuth", "useTheme"],
    },
  ],
};

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: sourceRules,
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.mjs", "vite.config.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
      parserOptions: { sourceType: "module" },
    },
    rules: js.configs.recommended.rules,
  },
];
