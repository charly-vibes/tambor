// Purpose: the CSS/TS theme drift guard — the shell palette lives in the
//   two HTML pages' CSS, because the shell must pick the scheme on the
//   FIRST paint (before any script runs, and before a host that reports
//   prefers-color-scheme late has settled), while src/ui/theme.ts stays
//   the single source of the values.
// Responsibilities: read index.html and tests/e2e/gallery.html from the
//   repo root, extract each page's light :root block and its
//   @media (prefers-color-scheme: dark) :root block, and assert every
//   --tambor-<token> equals tokenValue(token, scheme) rendered as
//   rgb(r, g, b) (0..1 channel x 255, rounded); assert the complete
//   token set (ui/theme.ts TOKENS) and nothing else appears in each
//   block; assert spa/main.ts writes no --tambor-* inline property (an
//   inline value outranks the media query and would freeze the shell in
//   the boot scheme).
// Rationale: openspec/changes/add-demo-visual-polish design.md D6 makes
//   ui/theme.ts the palette authority, and the CSS duplication is
//   deliberate — CSS cannot call tokenValue, and a script-resolved
//   palette paints the wrong shell while Chromium answers the dark
//   query wrong during page init (~450ms, with no change event). This
//   test makes the duplication safe instead of forbidden: editing a
//   token in ui/theme.ts without editing both pages (or the reverse)
//   fails here, so the values can only drift loudly.

import { describe, expect, it } from "vitest";
// @ts-expect-error node builtin (tsconfig types exclude node)
import { readFileSync } from "node:fs";
// @ts-expect-error node builtin (tsconfig types exclude node)
import { resolve } from "node:path";

import { TOKENS, tokenValue, type Scheme } from "../src/ui/theme.ts";

// The pages that declare the shell palette (repo-root relative: vitest
// runs with the repo root as cwd). The describes below spell each page
// literally instead of looping over this list: a describe built from a
// runtime array produces test names no static indexer can see, and the
// testaruda store then drifts every run (exit-10 uncalibrated at the
// gate with zero real failures — names the catalog never learned). Two
// pages, spelled out; add the next page as its own describe block.
// Repo-root relative: vitest runs with the repo root as cwd.

// The light block: the first :root declaration left once the dark media
// block is removed, so the order of the two blocks in the file is free.
const LIGHT_BLOCK = /:root\s*\{([^}]*)\}/;
const DARK_BLOCK =
  /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/;

// The shell palette as CSS spells it: each ui/theme.ts token's 0..1
// channels scaled to 0..255 bytes and rounded — the same conversion the
// pages' values were written with, so a JS consumer and the CSS can
// never disagree.
function cssColor(token: string, scheme: Scheme): string {
  const color = tokenValue(token, scheme);
  const channel = (i: number): number => Math.round((color[i] ?? 0) * 255);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

// The --tambor-* declarations a block carries, keyed by property name.
function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--tambor-[a-z]+)\s*:\s*([^;]+);/g)) {
    const name = m[1];
    const value = m[2];
    if (name !== undefined && value !== undefined) out.set(name, value.trim());
  }
  return out;
}

// One page's two palette blocks, each as its declarations.
function paletteBlocks(
  html: string,
): { light: Map<string, string>; dark: Map<string, string> } {
  const darkMatch = DARK_BLOCK.exec(html);
  const darkBody = darkMatch?.[1];
  if (darkMatch === null || darkBody === undefined) {
    throw new Error("missing the dark prefers-color-scheme :root block");
  }
  const lightMatch = LIGHT_BLOCK.exec(html.replace(darkMatch[0], ""));
  const lightBody = lightMatch?.[1];
  if (lightBody === undefined) throw new Error("missing the light :root block");
  return { light: declarations(lightBody), dark: declarations(darkBody) };
}

// The token set is the whole vocabulary: ui/theme.ts TOKENS is the
// palette authority, so a block must carry every token and nothing
// else, and a stray --tambor-* property cannot rot unseen.
function expectTokenSet(block: Map<string, string>, where: string): void {
  expect([...block.keys()].sort(), `${where} tokens`).toEqual(
    TOKENS.map((token) => `--tambor-${token}`).sort(),
  );
}

describe("theme CSS sync — the pages' palette against ui/theme.ts", () => {
  // The three palette assertions are spelled out per page (not hoisted
  // into a helper): its registered from a helper function lose their
  // describe chain in static test discovery, and the testaruda store
  // then never learns the runtime names (same exit-10 drift as the
  // dynamic titles). Lexical nesting is the contract here.

  describe("index.html", () => {
    const { light, dark } = paletteBlocks(
      readFileSync(resolve("index.html"), "utf8"),
    );

    it("declares exactly the ui/theme.ts tokens in both blocks", () => {
      expectTokenSet(light, "index.html light :root");
      expectTokenSet(dark, "index.html dark :root");
    });

    it("light values are tokenValue(token, 'light') as rgb()", () => {
      for (const token of TOKENS) {
        expect(light.get(`--tambor-${token}`), `--tambor-${token}`).toBe(
          cssColor(token, "light"),
        );
      }
    });

    it("dark values are tokenValue(token, 'dark') as rgb()", () => {
      for (const token of TOKENS) {
        expect(dark.get(`--tambor-${token}`), `--tambor-${token}`).toBe(
          cssColor(token, "dark"),
        );
      }
    });
  });

  describe("tests/e2e/gallery.html", () => {
    const { light, dark } = paletteBlocks(
      readFileSync(resolve("tests/e2e/gallery.html"), "utf8"),
    );

    it("declares exactly the ui/theme.ts tokens in both blocks", () => {
      expectTokenSet(light, "tests/e2e/gallery.html light :root");
      expectTokenSet(dark, "tests/e2e/gallery.html dark :root");
    });

    it("light values are tokenValue(token, 'light') as rgb()", () => {
      for (const token of TOKENS) {
        expect(light.get(`--tambor-${token}`), `--tambor-${token}`).toBe(
          cssColor(token, "light"),
        );
      }
    });

    it("dark values are tokenValue(token, 'dark') as rgb()", () => {
      for (const token of TOKENS) {
        expect(dark.get(`--tambor-${token}`), `--tambor-${token}`).toBe(
          cssColor(token, "dark"),
        );
      }
    });
  });

  it("spa/main.ts writes no --tambor-* inline property", () => {
    // The install once published the palette on documentElement; an
    // inline custom property beats the media query, so the shell would
    // keep the boot scheme for the session's whole life.
    const main = readFileSync(resolve("src/spa/main.ts"), "utf8");
    expect(main).not.toMatch(/setProperty\(\s*[`"']--tambor-/);
  });
});