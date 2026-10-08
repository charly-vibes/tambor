// Purpose: executable contract tests for the ui-mobile spec's theme
//   and haptics rows — theme-aware tokens under both color schemes and
//   optional haptics on tap.
// Responsibilities: encode each converted row's generator and predicate
//   as a vitest + fast-check property, one test per converted property.
// Rationale: specs/ui-mobile.md is the design authority; each predicate
//   here mirrors a Properties row (generator + predicate text).
//   tambor-272: redistributed from the former monolithic
//   tests/ui-mobile.test.ts — test names are byte-identical contract
//   bindings.

import { expect, it } from "vitest";
import fc from "fast-check";

import {
  colorSchemePref,
  SCHEMES,
  TOKENS,
  tokenValue,
} from "../src/ui/theme.ts";
import { TAP_VIBRATE_MS, tapHaptics } from "../src/ui/haptics.ts";

// ---------------------------------------------------------------------------
// p_theme — theme_aware
// ---------------------------------------------------------------------------

// p_theme — derives_from: ui.mobile.theme_aware
// generator: both color schemes
// predicate: tokens resolve in each
it("p_theme: tokens resolve in each", () => {
  // Both color schemes, exhaustively.
  expect(SCHEMES).toEqual(["light", "dark"]);
  expect(TOKENS.length).toBeGreaterThan(0);
  for (const scheme of SCHEMES) {
    for (const token of TOKENS) {
      const value = tokenValue(token, scheme);
      expect(value.length).toBeGreaterThanOrEqual(3);
      for (const c of value) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
        expect(Number.isFinite(c)).toBe(true);
      }
    }
  }
  // Colors follow prefers-color-scheme.
  expect(
    colorSchemePref((q) => (q === "prefers-color-scheme: dark" ? { matches: true } : undefined)),
  ).toBe("dark");
  expect(colorSchemePref(() => ({ matches: false }))).toBe("light");
  expect(colorSchemePref(() => undefined)).toBe("light");
  // The two themes differ on at least one token (explicit tokens for
  // both themes, not one shared palette).
  const differing = TOKENS.some(
    (t) => tokenValue(t, "light").join(",") !== tokenValue(t, "dark").join(","),
  );
  expect(differing).toBe(true);
});

// ---------------------------------------------------------------------------
// p_haptics — haptics_optional
// ---------------------------------------------------------------------------

// p_haptics — derives_from: ui.mobile.haptics_optional
// generator: vibrate present and absent
// predicate: no error either way
it("p_haptics: no error either way", () => {
  const calls: number[] = [];
  const present = { vibrate: (ms: number) => (calls.push(ms), true) };
  const absent = {};
  expect(TAP_VIBRATE_MS).toBeGreaterThan(0);
  fc.assert(
    fc.property(fc.constantFrom(present, absent, undefined, null), (nav) => {
      calls.length = 0;
      // No error either way.
      expect(() => tapHaptics(nav)).not.toThrow();
      if (nav === present) {
        // A short vibration on button taps where navigator.vibrate exists.
        expect(calls).toEqual([TAP_VIBRATE_MS]);
      } else {
        expect(calls).toEqual([]);
      }
    }),
  );
});
