// Purpose: docs theme fidelity audit (add-docs-site task 5.1) — the docs
//   chrome paints only ui/theme.ts token values, and every body-text pair
//   the docs theme maps meets WCAG AA contrast in both schemes.
// Responsibilities: pin src/docs/theme.ts's surface (the four docs roles,
//   their token mapping, the colorSchemePref-resolved resolver), compute
//   WCAG 2.x contrast from the token VALUES themselves (so a palette
//   change that breaks readability breaks this test, design D4), and
//   source-scan the docs modules: no literal color outside theme.ts and
//   theme.ts is the only docs importer of ui/theme.ts (views consume
//   mapped roles, never tokens).
// Rationale: openspec/changes/add-docs-site/design.md D4 — "Docs chrome
//   consumes ui/theme.ts tokens ... resolved per scheme via
//   colorSchemePref's injected matcher. No literal colors in docs view
//   code — enforced by a token-audit test. Contrast ... is computed from
//   the token values themselves, so the check breaks the build if a
//   palette change ever breaks readability in either scheme." The scan
//   covers the docs root modules only: content/generated is verbatim
//   corpus output (regenerated, gitignored) and carries no chrome.

import { describe, expect, it } from "vitest";
// @ts-expect-error node:fs has no type declarations here
import { readFileSync, readdirSync } from "node:fs";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";
import {
  DOCS_ROLES,
  ROLE_TOKEN,
  docsBackground,
  docsColors,
} from "../src/docs/theme.ts";
import { SCHEMES, TOKENS, tokenValue, type MediaQueryFn } from "../src/ui/theme.ts";
import type { Color } from "../src/views/model.ts";

const DOCS_DIR = resolve("src/docs");
const THEME_FILE = "theme.ts";
const AA_BODY_TEXT = 4.5;

// WCAG 2.x relative luminance of a corpus Color (sRGB floats 0..1).
function luminance(c: Color): number {
  const lin = (v: number): number =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
}

// WCAG contrast ratio: lighter luminance over darker, plus the 0.05 floor.
function contrast(a: Color, b: Color): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The literal-color shapes the audit forbids in docs sources: CSS hex
// notations (3/6/8 digits) and the rgb/rgba/hsl/hsla function calls.
const HEX_LITERAL = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/;
const CSS_COLOR_FN = /\b(?:rgba?|hsla?)\s*\(/;
// Docs modules reach tokens only through ./theme.ts — a direct
// ../ui/theme.ts import outside theme.ts bypasses the role mapping.
const UI_THEME_IMPORT = /from\s+"\.\.\/ui\/theme\.ts"/;
const THEME_CONSUMPTION = /from\s+"\.\/theme\.ts"/;

// The docs root modules under audit (content/ is generated corpus text).
function docsSources(): string[] {
  return readdirSync(DOCS_DIR).filter((f: string) => f.endsWith(".ts"));
}

function source(file: string): string {
  return readFileSync(resolve(DOCS_DIR, file), "utf8");
}

describe("docs theme audit (add-docs-site task 5.1)", () => {
  it("declares exactly the four docs roles", () => {
    expect([...DOCS_ROLES].sort()).toEqual(["body", "code", "heading", "nav"]);
  });

  it("maps every role to an existing ui token", () => {
    for (const role of DOCS_ROLES) {
      expect(TOKENS, `${role} must map to a ui token`).toContain(
        ROLE_TOKEN[role],
      );
    }
  });

  it("body-text pairs meet WCAG AA (≥ 4.5:1) in both schemes", () => {
    for (const scheme of SCHEMES) {
      for (const role of DOCS_ROLES) {
        const fg = tokenValue(ROLE_TOKEN[role]!, scheme);
        const bg = tokenValue("background", scheme);
        expect(contrast(fg, bg), `${role} on background in ${scheme}`).toBeGreaterThanOrEqual(
          AA_BODY_TEXT,
        );
      }
    }
  });

  it("resolves roles through colorSchemePref's injected matcher", () => {
    const dark: MediaQueryFn = () => ({ matches: true });
    const light: MediaQueryFn = () => ({ matches: false });
    const colors = docsColors(dark);
    const lit = docsColors(light);
    for (const role of DOCS_ROLES) {
      expect(colors[role]).toEqual(tokenValue(ROLE_TOKEN[role]!, "dark"));
      expect(lit[role]).toEqual(tokenValue(ROLE_TOKEN[role]!, "light"));
    }
    expect(docsBackground(dark)).toEqual(tokenValue("background", "dark"));
    expect(docsBackground(light)).toEqual(tokenValue("background", "light"));
  });

  it("no literal color in docs sources outside theme.ts", () => {
    const offenders = docsSources()
      .filter((f) => f !== THEME_FILE)
      .filter((f) => {
        const text = source(f);
        return HEX_LITERAL.test(text) || CSS_COLOR_FN.test(text);
      });
    expect(offenders, "literal colors must live in docs/theme.ts as tokens").toEqual(
      [],
    );
  });

  it("views consume mapped roles — theme.ts is the only ui/theme importer", () => {
    let consumers = 0;
    for (const file of docsSources()) {
      if (file === THEME_FILE) continue;
      const text = source(file);
      expect(UI_THEME_IMPORT.test(text), `${file} imports ui/theme directly`).toBe(
        false,
      );
      if (THEME_CONSUMPTION.test(text)) consumers += 1;
    }
    expect(consumers, "no docs view consumes ./theme.ts roles").toBeGreaterThan(0);
  });
});
