// Purpose: the docs DOM seam (add-docs-site task 3.2) — the two
//   host-side capabilities the corpus tree cannot express: keyboard
//   activation of the navigation and DOM focus management for the
//   content pane.
// Responsibilities: wireDocsDom(root, container, app, dispatch)
//   attaches the keydown listener that turns a keyboard activation of a
//   focused nav control into the same select-page intent the pointer
//   path emits, and registers the docs-focus effect — the
//   effect-dispatch seam whose handler records the focus target on the
//   docs state path and runs the host hook (focus the pane heading)
//   once the draw carrying the completed page has landed in the DOM;
//   clearDocsDom drops the mounted instance on unmount.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Site shell and navigation" — the navigation SHALL be operable by
//   keyboard alone and completing a page change SHALL move focus to the
//   content pane. The corpus routes pointer hits to a button's onClick
//   (button_fires_on_down) but knows nothing of DOM focus, so both the
//   keyboard activation and the focus move are host seams; the effect
//   mirrors the corpus request-focus effect (src/spa/focus.ts), which
//   sets a state path and focuses the surface in the same handler.

import { defeffect, type App, type Effect } from "../effects/dispatch.ts";
import type { HostElement } from "../interop/domhost.ts";
import { NAV } from "./nav.ts";
import { generatedPages, type GeneratedPage } from "./content/generated/registry.ts";

// The current-entry marker the nav draws on the selected page.
const CURRENT = "▸ ";

// The mounted docs instance the focus effect resolves its container
// through — the effect registry is global, so the ref is per-mount and
// cleared on unmount (the corpus request-focus precedent,
// src/spa/focus.ts).
let mounted: { container: HostElement; app: App } | null = null;

let registered = false;

// Register the docs-focus effect once: it records the focus target on
// the docs state path and runs the host hook after the draw that
// carries the completed page.
export function registerDocsFocus(): void {
  if (registered) return;
  registered = true;
  defeffect("docs-focus", (dispatch, ...raw: unknown[]) => {
    const page = raw[0];
    if (typeof page !== "string") return;
    // the state path: the docs state names the page whose heading
    // holds DOM focus
    dispatch(["select-focus", page]);
    // the host hook: the DOM carries the completed page only once the
    // draw that follows this dispatch has landed, so the focus waits
    // for the microtask after it
    void Promise.resolve().then(() => focusHeading(page));
  });
}

// The page title with the current marker — the selected entry's text.
function markedTitle(page: GeneratedPage): string {
  return CURRENT + page.title;
}

// The page a nav control names: its text is the page title, with the
// current marker on the selected entry.
function pageOfNavText(text: string): string | undefined {
  for (const page of generatedPages) {
    if (text === page.title || text === markedTitle(page)) return page.name;
  }
  return undefined;
}

// The pane heading of a page: the first drawn label carrying the page
// title. The nav group headers share the label shape, so a header
// spelling is never mistaken for the heading (a page titled like a
// group finds no heading and fails loud below).
function headingOf(container: HostElement, title: string): HostElement | null {
  for (const span of container.querySelectorAll("span")) {
    if (span.textContent !== title) continue;
    if (NAV.some((group) => group.header === title)) continue;
    return span;
  }
  return null;
}

// The page title of a generated page.
function titleOf(page: string): string | undefined {
  return generatedPages.find((p) => p.name === page)?.title;
}

// Move DOM focus to the pane heading of the completed page: the
// heading is a drawn label, so it takes a tabindex of -1 (focusable
// without joining the tab order) and the heading role it stands for.
function focusHeading(page: string): void {
  const instance = mounted;
  if (instance === null) return;
  // A load that lost the race (the visitor moved on) lands no focus —
  // the pane shows another page and its heading is not drawn.
  const current = (instance.app.getState() as { page?: unknown } | null)?.page;
  if (typeof current === "string" && current !== page) return;
  const title = titleOf(page);
  if (title === undefined) return;
  const heading = headingOf(instance.container, title);
  if (heading === null) {
    throw new Error(`docs: no pane heading for page ${page}`);
  }
  heading.setAttribute("tabindex", "-1");
  heading.setAttribute("role", "heading");
  heading.setAttribute("aria-level", "1");
  heading.focus?.();
}

// The keyboard activation of a nav control: Enter (or Space) on the
// focused control selects its page, the same intent the pointer path
// emits. The corpus routes pointer hits to a button's onClick, but a
// keyboard activation never reaches the corpus — the host seam does.
function wireKeyboard(
  root: HostElement,
  dispatch: (batch: readonly Effect[]) => void,
): void {
  root.addEventListener("keydown", (raw) => {
    const e = raw as {
      key?: unknown;
      target?: unknown;
      preventDefault?: () => void;
    };
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target as HostElement | undefined;
    if (target === undefined || typeof target.textContent !== "string") return;
    const page = pageOfNavText(target.textContent);
    if (page === undefined) return;
    e.preventDefault?.();
    dispatch([["select-page", page]]);
  });
}

// Wire the docs DOM seams for one mount: the keyboard activation on
// the drawn root (the root element survives every draw, only its
// children are replaced) and the focus effect's instance ref.
export function wireDocsDom(
  root: HostElement,
  container: HostElement,
  app: App,
  dispatch: (batch: readonly Effect[]) => void,
): void {
  mounted = { container, app };
  registerDocsFocus();
  wireKeyboard(root, dispatch);
}

// Drop the mounted instance (the focus effect resolves its container
// through it) — the unmount path calls this.
export function clearDocsDom(): void {
  mounted = null;
}
