// Purpose: the SPA focus plumbing (tambor-e5n) — the request-focus
//   effect registration and the focus view-context entry the mount
//   relies on.
// Responsibilities: registerSpaFocus() registers the corpus
//   request-focus effect exactly once via defeffect: it sets the focus
//   state the textarea handlers emit against (FOCUS_PATH, the corpus
//   ::context/focus location) and focuses the current SPA surface so
//   keydown/paste events flow into the corpus (request_focus_apply);
//   setFocusSurface() records (or clears, on unmount) the current
//   mount's focusable surface; focusContext(state) builds the
//   view-context focus entry (focus_ctx: context.focus is the state at
//   FOCUS_PATH) for the app view to merge.
// Rationale: textarea handlers emit ["request-focus", textPath]
//   (components/textarea/handlers.ts) but nothing in the SPA registered
//   the effect — the dispatcher reported "unknown effect type:
//   request-focus" and dropped it — and makeApp never put FOCUS_KEY in
//   the view context. makeTopApp owns the corpus click-away/scroll
//   wires, but its nested event layers are unroutable in the SPA
//   (mount.ts rationale), so the SPA registers request-focus and the
//   context entry only (tambor-e5n scope; wheel/global-mousemove are
//   tambor-gov). Programmatic restoration path — a native click focuses
//   a real <textarea> by itself, this covers focus set from anywhere
//   else (the pin in tests/spa-mount.test.ts dispatches synthetically).

import { defeffect, type ViewFn } from "../effects/dispatch.ts";
import { FOCUS_PATH } from "../app/top.ts";
import { select } from "../effects/paths.ts";

/** The minimal surface capability the effect needs: DOM focus. */
export interface FocusSurface {
  focus(): void;
}

// The current mount's surface; the registry is global, so the effect
// resolves the surface through this ref rather than closure state.
let current: FocusSurface | null = null;

/** Record the focusable surface of the active mount (null clears). */
export function setFocusSurface(surface: FocusSurface | null): void {
  current = surface;
}

let registered = false;

/** Register the request-focus effect; idempotent (one global entry). */
export function registerSpaFocus(): void {
  if (registered) return;
  registered = true;
  defeffect("request-focus", (dispatch, ...raw: unknown[]) => {
    dispatch(["set", FOCUS_PATH, raw[0] ?? null]);
    current?.focus();
  });
}

/** The view-context focus entry: the state at the corpus focus path. */
export function focusContext(state: unknown): { focus: unknown } {
  return { focus: select(state, FOCUS_PATH) };
}

/** The SPA view wrapper: merges the focus context entry into whatever
 * context makeApp built (makeApp only injects the container size) so
 * views that read context.focus (the textarea's contextual focus)
 * see the state the request-focus effect set (focus_ctx). */
export function spaFocusView(view: ViewFn): ViewFn {
  return (state, context) => view(state, { ...context, ...focusContext(state) });
}
