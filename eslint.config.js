import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**", "scripts/**", "**/*.mjs", "**/*.cjs"],
    rules: { "no-restricted-syntax": "off", "@typescript-eslint/no-explicit-any": "off" }
  }
);
