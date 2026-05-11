import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import regexp from "eslint-plugin-regexp"
import redos from "eslint-plugin-redos"

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  regexp.configs["flat/recommended"],
  {
    plugins: { redos },
    rules: {
      "regexp/prefer-named-capture-group": "error",
      "regexp/no-super-linear-move": "error",
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
