import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // jest-junit output at target/test-results.xml is what the
    // testaruda typescript adapter ingests (see testaruda.toml).
    reporters: ["default", "junit"],
    outputFile: "target/test-results.xml",
  },
});
