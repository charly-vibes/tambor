// Purpose: the scope contract for the bombadil exploration suite
//   (openspec/changes/add-bombadil-exploration, task 1.2) — the suite
//   lives beside the repo, never inside the existing gates' inputs.
// Responsibilities: assert the root tsconfig include has no `bombadil`
//   entry, vitest's include is exactly `tests/**/*.test.ts` with no
//   `bombadil`, eslint's ignores list carries `bombadil/`, and the
//   installed CLI version is pinned exactly to 0.7.10.
// Rationale: Bombadil runs are nondeterministic, time-bounded explorations
//   (design D3) and must never enter the required gates. These four
//   assertions pin the boundary as text, so a config edit that
//   accidentally sweeps the suite into tsc/vitest/eslint turns red here
//   instead of silently adding minutes to CI.

// @ts-expect-error node builtin (tsconfig types exclude node; repo
// test-local pin convention, e.g. vitest-config.test.ts)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT_TSCONFIG = JSON.parse(readFileSync("tsconfig.json", "utf8")) as {
  include?: string[];
};

const PACKAGE_JSON = JSON.parse(readFileSync("package.json", "utf8")) as {
  devDependencies?: Record<string, string>;
};

const VITEST_TEXT = readFileSync("vitest.config.ts", "utf8");
const ESLINT_TEXT = readFileSync("eslint.config.js", "utf8");

describe("bombadil suite scope — kept_out_of_the_gates", () => {
  it("the root tsconfig include does not cover bombadil/", () => {
    const include = ROOT_TSCONFIG.include ?? [];
    expect(include.length).toBeGreaterThan(0);
    expect(include.some((entry) => entry.toLowerCase().includes("bombadil"))).toBe(false);
  });

  it("vitest includes only tests/**/*.test.ts", () => {
    expect(VITEST_TEXT).toMatch(/include:\s*\[\s*"tests\/\*\*\/\*\.test\.ts"\s*\]/);
    expect(VITEST_TEXT.toLowerCase()).not.toContain("bombadil");
  });

  it("eslint ignores bombadil/", () => {
    const ignores = /ignores:\s*\[([\s\S]*?)\]/.exec(ESLINT_TEXT)?.[1] ?? "";
    expect(ignores).toContain('"bombadil/"');
  });

  it("pins @antithesishq/bombadil exactly", () => {
    expect(PACKAGE_JSON.devDependencies?.["@antithesishq/bombadil"]).toBe("0.7.10");
  });
});