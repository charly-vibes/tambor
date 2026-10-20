// eslint.config.js — flat config (tambor-ip9)
// Scope mirrors tsconfig include (src/**, tests/**, vitest.config.ts);
// dist/, demo-dist/, and scripts are ignored (no tsconfig coverage).
// The three rules from the chat-773745b6 audit: no-floating-promises,
// switch-exhaustiveness-check, no-unnecessary-condition. The Node/Elem
// unions are exactly where exhaustiveness pays.
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "demo-dist/",
      "coverage/",
      "target/",
      "benchmarks/",
      "experiments/",
      "**/*.mjs",
      "eslint.config.js",
      "vitest.config.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
