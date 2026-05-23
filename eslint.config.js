import eslint from "@eslint/js"
import perfectionist from "eslint-plugin-perfectionist"
import redos from "eslint-plugin-redos"
import regexp from "eslint-plugin-regexp"
import tseslint from "typescript-eslint"

const regexpErrors = Object.fromEntries(
  Object.entries(regexp.configs["flat/recommended"].rules ?? {}).map(
    ([rule, config]) => [rule, Array.isArray(config) ? ["error", ...config.slice(1)] : "error"]
  )
)

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  regexp.configs["flat/recommended"],
  {
    plugins: { perfectionist, redos },
    rules: {
      ...regexpErrors,
      "perfectionist/sort-array-includes": ["error", { type: "natural", order: "asc" }],
      "perfectionist/sort-exports": ["error", { type: "natural", order: "asc" }],
      "perfectionist/sort-named-exports": ["error", { type: "natural", order: "asc" }],
      "perfectionist/sort-named-imports": ["error", { type: "natural", order: "asc" }],
      "regexp/no-super-linear-move": "error",
      "regexp/prefer-named-capture-group": "error",
      "redos/no-vulnerable": "error",
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
