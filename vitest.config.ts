import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // jest-junit output at target/test-results.xml is what the
    // testaruda typescript adapter ingests (see testaruda.toml).
    // PER-REPORTER outputFile (tambor-8rq): a global string outputFile
    // applies to EVERY file reporter, so ah's batched `--reporter=json`
    // invocation wrote its JSON over the junit file AND left stdout empty
    // — ah's batch-fallback then re-ran 329/658 contracts per-binding and
    // the batching win (GH#40) was lost. With the object form, junit keeps
    // its own file (testaruda ingests it, see testaruda.toml). The json
    // attribution now reads the named report file (ah 0.12.0, GH#46) —
    // no routing shim needed (tambor-8rq shim retired in tambor-kue).
    reporters: ["default", "junit"],
    outputFile: { junit: "target/test-results.xml" },
  },
});
