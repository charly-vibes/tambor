// Purpose: the docs theme module (add-docs-site task 5.2) — maps the
//   docs roles (nav, heading, body, code) onto ui/theme.ts tokens and
//   resolves them per scheme through colorSchemePref's injected matcher.
// Responsibilities: DocsRole — the semantic color vocabulary docs views
//   may speak; ROLE_TOKEN — the role-to-token mapping (a docs role never
//   names a color, only a ui token); docsColors/docsBackground — the
//   per-scheme resolvers; the ambient cell — the mount-time resolution
//   views read, installed once per mount through the host matcher
//   (the mountDocs liveBackend cell precedent).
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Theme fidelity" and design.md D4 are the design authorities: the
//   docs chrome colors itself only through the theme tokens of both
//   prefers-color-scheme schemes, so palette changes flow from
//   ui/theme.ts without touching docs views — and the token-audit test
//   (tests/docs-theme.test.ts) breaks the build if either a literal
//   color leaks into docs code or a mapped pair's WCAG AA contrast
//   breaks in either scheme. All four roles map to "foreground" today:
//   it is the only token pair that meets AA ≥ 4.5:1 as body text in
//   BOTH schemes (accent-on-background reaches only ~4.0:1 in light);
//   non-text chrome (the band) takes the background token.

import {
  colorSchemePref,
  tokenValue,
  type MediaQueryFn,
} from "../ui/theme.ts";
import type { Color } from "../views/model.ts";

// The semantic color roles of the docs chrome.
export type DocsRole = "nav" | "heading" | "body" | "code";

export const DOCS_ROLES: readonly DocsRole[] = [
  "nav",
  "heading",
  "body",
  "code",
];

// The ui token each docs role consumes (Theme fidelity: tokens only —
// a role never carries a literal color).
export const ROLE_TOKEN: Readonly<Record<DocsRole, string>> = {
  nav: "foreground",
  heading: "foreground",
  body: "foreground",
  code: "foreground",
};

// The role colors the host's ambient scheme resolves to: the matcher
// seam is colorSchemePref's (theme_aware — the corpus pins the
// mechanism, ui/theme.ts pins the palette).
export function docsColors(
  match: MediaQueryFn,
): Readonly<Record<DocsRole, Color>> {
  const scheme = colorSchemePref(match);
  const entries = DOCS_ROLES.map(
    (role) => [role, tokenValue(ROLE_TOKEN[role], scheme)] as const,
  );
  return Object.fromEntries(entries) as Readonly<Record<DocsRole, Color>>;
}

// The chrome band color: the background token in the ambient scheme.
export function docsBackground(match: MediaQueryFn): Color {
  return tokenValue("background", colorSchemePref(match));
}

// The ambient resolution the docs views read. Views must stay pure
// derivations (no host access), so mountDocs resolves ONCE through the
// host's matcher and installs the result here — the same const-cell
// shape as mountDocs' liveBackend (property writes, no module lets —
// the pretender mut_ratio gate pins cells to this idiom). The default
// resolves light (a null matcher never matches: colorSchemePref's
// undefined-or-null contract), so headless derivations before a mount
// are still token-colored.
const ambient: {
  colors: Readonly<Record<DocsRole, Color>>;
  band: Color;
} = {
  colors: docsColors(() => null),
  band: docsBackground(() => null),
};

// Install the ambient resolution for this mount: called from mountDocs
// with the host doc's matchMedia seam (HostDoc.matchMedia).
export function resolveAmbient(match: MediaQueryFn): void {
  ambient.colors = docsColors(match);
  ambient.band = docsBackground(match);
}

// The ambient color of a docs role — the only color source docs views
// consume (Theme fidelity: views speak roles, never tokens).
export function ambientColor(role: DocsRole): Color {
  return ambient.colors[role];
}

// The ambient chrome band color.
export function ambientBackground(): Color {
  return ambient.band;
}
