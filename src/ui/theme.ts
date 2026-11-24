// Purpose: the theme layer of the corpus — colors follow
//   prefers-color-scheme, with explicit tokens for both themes.
// Responsibilities: the scheme list (light, dark), the named token
//   list, tokenValue resolving a token in a scheme, and
//   colorSchemePref reading the media query through an injected
//   matcher.
// Rationale: openspec/specs/ui-mobile/spec.md theme_aware is the design authority:
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
  "muted",
];

// The explicit per-theme values. The accent reuses the corpus's
// selected fill (components.select row_visuals): light is the pinned
// [0, 0.42, 1] — darkened from [0, 0.48, 1] (4.02:1) so the white
// selected-row label meets the 4.5:1 AA floor at 4.62:1 (tambor-bc2);
// dark is deeper so the white selected-row label keeps
// ~6.9:1 contrast (white on the old [0.3, 0.6, 1] was only ~2.4:1).
// The danger light tone is the delete-X stroke red [1, 0, 0] pinned
// by example.todo.delete_x_geometry; dark lifts it to [1, 0.35, 0.35]
// so the stroke stays readable on the dark background.
// The muted tone is the accessible inactive ink (toggle_render's
// unselected options, the select header's no-selection text): light
// [0.45, 0.45, 0.45] is 4.75:1 on white, dark [0.75, 0.75, 0.75] is
// ~9:1 on the dark background — the 4.5:1 floor in both schemes.
const VALUES: Readonly<Record<string, Readonly<Record<Scheme, Color>>>> = {
  background: { light: [1, 1, 1], dark: [0.12, 0.12, 0.14] },
  foreground: { light: [0.1, 0.1, 0.1], dark: [0.95, 0.95, 0.95] },
  accent: { light: [0, 0.42, 1], dark: [0, 0.31, 0.8] },
  border: { light: [0.65, 0.65, 0.65], dark: [0.35, 0.35, 0.35] },
  danger: { light: [1, 0, 0], dark: [1, 0.35, 0.35] },
  muted: { light: [0.45, 0.45, 0.45], dark: [0.75, 0.75, 0.75] },
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
