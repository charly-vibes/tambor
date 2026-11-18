// Purpose: the demos' theme seam (add-demo-visual-polish task 6.1) —
//   maps the demo color roles (background, foreground, accent, border,
//   danger, muted) onto ui/theme.ts tokens and resolves them per scheme
//   through colorSchemePref's injected matcher.
// Responsibilities: ThemeRole — the semantic color vocabulary demo
//   views may speak; THEME_ROLES — the complete role list; ROLE_TOKEN —
//   the role-to-token mapping (a role never names a color, only a ui
//   token); themeColors — the per-scheme resolver; ambientScheme — the
//   scheme observation both color paths share (a flip invalidates the
//   component render cache); the ambient cell — the host matcher every
//   demo color resolves through, installed once per mount (the
//   mountDocs liveBackend precedent), plus the last observed scheme.
// Rationale: openspec/changes/add-demo-visual-polish design.md D6 is
//   the design authority: phase 3 tokens flow one direction — demos
//   read, ui/theme.ts owns the values. Tests inject a fixed matcher
//   (light or dark) and views stay pure derivations that resolve the
//   ambient matcher, so no literal inks remain in demo code and the
//   palette changes flow from ui/theme.ts alone. The cell holds the
//   MATCHER, never a resolved palette: a boot-time scheme snapshot
//   froze the light inks for the whole session once the host answered
//   the dark query wrong during page init (the scheme settled ~450ms
//   later without firing a change event), while a per-call resolve
//   makes every draw paint what the host reports at draw time. The
//   role set is the token vocabulary itself: accented fills, danger
//   strokes, inactive ink, chrome text and the shell.
//   A per-call resolve alone is not enough, because two caches sit
//   between the host and the pixels: the route-time view cache
//   (spa/mount.ts) and the component render cache
//   (model/component-cache.ts), whose key is the props map — ambient
//   colors never enter it. A flip must therefore INVALIDATE the
//   component cache before the next derivation, or the draw replays the
//   previous scheme's trees (measured: the light muted ink on a dark
//   page). observeScheme is that edge; the cell still holds no palette,
//   only the matcher and the last observation.

import {
  colorSchemePref,
  tokenValue,
  type MediaQueryFn,
  type Scheme,
} from "./theme.ts";
import { clearRenderCache } from "../model/component-cache.ts";
import type { Color } from "../views/model.ts";

// The semantic color roles of the demos.
export type ThemeRole =
  | "background"
  | "foreground"
  | "accent"
  | "border"
  | "danger"
  | "muted";

export const THEME_ROLES: readonly ThemeRole[] = [
  "background",
  "foreground",
  "accent",
  "border",
  "danger",
  "muted",
];

// The ui token each demo role consumes (D6: tokens only — a role
// never carries a literal color).
export const ROLE_TOKEN: Readonly<Record<ThemeRole, string>> = {
  background: "background",
  foreground: "foreground",
  accent: "accent",
  border: "border",
  danger: "danger",
  muted: "muted",
};

// The role colors the host's ambient scheme resolves to: the matcher
// seam is colorSchemePref's (theme_aware — the mechanism is pinned by
// the corpus, ui/theme.ts pins the palette).
export function themeColors(
  match: MediaQueryFn,
): Readonly<Record<ThemeRole, Color>> {
  const scheme = colorSchemePref(match);
  const entries = THEME_ROLES.map(
    (role) => [role, tokenValue(ROLE_TOKEN[role], scheme)] as const,
  );
  return Object.fromEntries(entries) as Readonly<Record<ThemeRole, Color>>;
}

// The ambient theme cell: the host matcher the demo views resolve
// through. Views must stay pure derivations (no host access), so the
// demo mount installs its matcher here — the same const-cell shape as
// mountDocs' liveBackend (property writes, no module lets — the
// pretender mut_ratio gate pins cells to this idiom). The cell holds
// the MATCHER, not a resolved palette: ambientColor asks it for the
// scheme on EVERY call, so each draw paints the scheme the host
// reports at that moment. The default matcher never matches:
// colorSchemePref's undefined-or-null contract reads it as light, so
// headless derivations before a mount are still token-colored. The cell
// also keeps the LAST observed scheme — an invalidation trigger, never
// a palette: the palette is still resolved per call from ui/theme.ts.
const ambient: {
  match: MediaQueryFn;
  scheme: Scheme;
} = {
  match: () => null,
  // The default matcher never matches, so the pre-mount reading is
  // light (colorSchemePref's contract).
  scheme: "light",
};

// Install the ambient matcher for this mount: called from the demo
// host with its matchMedia seam (HostDoc.matchMedia).
export function resolveAmbientTheme(match: MediaQueryFn): void {
  ambient.match = match;
}

// The scheme the host reports right now, and the flip edge: a scheme
// different from the last observation clears the component render
// cache BEFORE the caller derives, so the next assembly rebuilds the
// cached trees with the new ambient ink. Shared by ambientColor (inside
// component bodies) and ambientScheme (the mount and the boot-scheme
// correction call it ahead of a draw), so either path notices a flip.
// INVARIANT: the clear runs on the FIRST observation of a new scheme
// only — every later call in that same draw (nested component bodies
// assemble one after another, all through ambientColor) sees an equal
// scheme and does nothing. One flip therefore clears exactly once, no
// matter how many ambient reads the draw makes, and a session whose
// scheme never changes never clears: the light path keeps its cache
// byte for byte.
function observeScheme(): Scheme {
  const scheme = colorSchemePref(ambient.match);
  if (scheme === ambient.scheme) return scheme;
  ambient.scheme = scheme;
  clearRenderCache();
  return scheme;
}

// The ambient scheme of the demo host — the public form of the
// observation above, for callers that must invalidate BEFORE a
// derivation (a draw whose props-keyed component cache is still warm
// would otherwise never reach ambientColor at all).
export function ambientScheme(): Scheme {
  return observeScheme();
}

// The ambient color of a demo role — the only color source demo views
// consume (D6: views speak roles, never tokens). Resolved per call
// against ROLE_TOKEN + the live matcher (through observeScheme, so a
// flip drops the component cache on the way), so a scheme change (or a
// host that only reports the real scheme after page init) reaches the
// next draw without any cached palette to invalidate.
export function ambientColor(role: ThemeRole): Color {
  return tokenValue(ROLE_TOKEN[role], observeScheme());
}

// The CSS custom property a literal demo color resolves to, or null when
// the color is not a token value. Painted as var(--tambor-<role>) the
// browser resolves the ink at PAINT time against the cascade, so a scheme
// the host reports late (or never reports as a change event) still paints
// the right ink — the timing-proof fix for the dark-scheme audit (the
// per-call resolve cannot win when the render cache replays a string).
// Two roles are excluded ON PURPOSE:
// - `danger`: the todo delete-X stroke is painted through an svg
//   ATTRIBUTE (stroke="..."), and attribute-painted colors cannot carry
//   var() — the corpus pin (example.todo.delete_x_geometry, [1, 0, 0])
//   would break, so danger stays a literal on both paths.
// - `background`: a surface token, never an ink — the selected-row
//   label's white [1, 1, 1] is background-light, and mapping it would
//   paint that label dark in the dark scheme (dark ink on the accent
//   fill). White stays literal white in both schemes.
const INK_ROLES: readonly ThemeRole[] = ["foreground", "muted", "accent", "border"];

export function cssVarColor(color: Color): string | null {
  for (const role of INK_ROLES) {
    const light = tokenValue(ROLE_TOKEN[role]!, "light");
    const dark = tokenValue(ROLE_TOKEN[role]!, "dark");
    const matches =
      color.length === light.length && light.every((v, i) => v === color[i]) ||
      color.length === dark.length && dark.every((v, i) => v === color[i]);
    if (matches) {
      return `var(--tambor-${role})`;
    }
  }
  return null;
}