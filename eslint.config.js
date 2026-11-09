import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "apps/site/public/**", ".regtest/**", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "Literal[raw=/^\\d+\\.\\d+$/]", message: "Avoid float literals near financial code; use bigint msat." }
      ]
    }
  },
  { files: ["**/*.mjs", "**/*.cjs", "scripts/**", "**/e2e/**", "**/*.config.js"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // pg returns untyped rows; typing every row shape is tracked as follow-up. The exemption is limited to the API layer.
  { files: ["apps/api/src/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off", "no-empty": "off" } },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**", "scripts/**", "**/*.mjs", "**/*.cjs"],
    rules: { "no-restricted-syntax": "off", "@typescript-eslint/no-explicit-any": "off" }
  }
);
