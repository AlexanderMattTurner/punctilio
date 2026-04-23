import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import regexp from "eslint-plugin-regexp"

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  regexp.configs["flat/recommended"],
  {
    rules: {
      "regexp/prefer-named-capture-group": "error",
    },
  },
  {
    files: ["*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        performance: "readonly",
      },
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  }
)
