// Purpose: the theme layer of the corpus — colors follow
//   prefers-color-scheme, with explicit tokens for both themes.
// Responsibilities: the scheme list (light, dark), the named token
//   list, tokenValue resolving a token in a scheme, and
//   colorSchemePref reading the media query through an injected
//   matcher.
// Rationale: specs/ui-mobile.md theme_aware is the design authority:
//   "colors follow prefers-color-scheme, with explicit tokens for both
//   themes". The corpus pins the mechanism, not the palette values;
//   the token names are this port's semantic vocabulary and each
//   token's value is explicit per theme — the property under test is
//   that every token resolves in every scheme. No behavior beyond the
//   corpus.

import type { Color } from "../views/model.ts";

// The two color schemes prefers-color-scheme names.
export type Scheme = "light" | "dark";
export const SCHEMES: readonly Scheme[] = ["light", "dark"];

// The semantic color tokens of the mobile UI: explicit for both
// themes (theme_aware).
export const TOKENS: readonly string[] = [
  "background",
  "foreground",
  "accent",
  "border",
  "danger",
];

// The explicit per-theme values. The accent reuses the corpus's
// selected fill (components.select row_visuals); the danger tone
// echoes the delete X red (example.todo delete_x_geometry).
const VALUES: Readonly<Record<string, Readonly<Record<Scheme, Color>>>> = {
  background: { light: [1, 1, 1], dark: [0.12, 0.12, 0.14] },
  foreground: { light: [0.1, 0.1, 0.1], dark: [0.95, 0.95, 0.95] },
  accent: { light: [0, 0.48, 1], dark: [0.3, 0.6, 1] },
  border: { light: [0.65, 0.65, 0.65], dark: [0.35, 0.35, 0.35] },
  danger: { light: [0.85, 0.1, 0.1], dark: [1, 0.3, 0.3] },
};

// The value of a token in a scheme; every token resolves in every
// scheme (theme_aware).
export function tokenValue(token: string, scheme: Scheme): Color {
  return VALUES[token]![scheme];
}

// An injected media-query matcher (same shape as ui/motion's).
export type MediaQueryFn = (query: string) => { matches: boolean } | undefined | null;

// The scheme the host reports: dark when prefers-color-scheme: dark
// matches, light otherwise (theme_aware).
export function colorSchemePref(match: MediaQueryFn): Scheme {
  return match("prefers-color-scheme: dark")?.matches === true ? "dark" : "light";
}
