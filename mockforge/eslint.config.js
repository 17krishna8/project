import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.d.ts", "**/vite.config.ts"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TypeScript already understands Node globals and the DOM lib, so the
    // environment-agnostic no-undef rule only produces false positives here.
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "error"
    }
  }
);
