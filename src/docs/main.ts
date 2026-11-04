// Purpose: the docs SPA entry (add-docs-site task 2.2) — mounts the
//   docs shell through the shared spa host: journey-grouped nav
//   (getting started / guides / reference / examples, D7 reader
//   order) plus a content pane rendering the selected page module.
// Responsibilities: mountDocs(doc, container) — docs app state is the
//   current page name plus its async-loaded verbatim body plus the page
//   whose heading holds DOM focus; the nav renders every registry page
//   under its journey group as a real DOM control (the corpus button
//   node paints a native <button>, focusable and keyboard reachable —
//   task 3.1) with the current entry marked (▸ prefix; task 5 layers
//   the theme highlight on top, the glyph keeps "current" legible
//   headless), a select-page effect swaps the page and kicks the D6
//   dynamic import for the body (the wire's async-dispatch path
//   re-draws on arrival), and the pane draws title, statement,
//   description and body lines as tambor elems. The docs-focus effect
//   (task 3.2, src/docs/dom.ts) records the focus target on the state
//   and moves DOM focus to the pane heading once the completed page
//   has been drawn. checkGroups runs at mount so an ungrouped page
//   fails loud before any nav render.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Site shell and navigation" is the design authority; the shell is
//   mounting plumbing over makeApp/dispatch with no semantics of its
//   own (tambor-cie gallery precedent), and the host is mountDemo
//   reused wholesale — imported, not moved (task 2.2 helper clause).

import { mountDemo, type SpaHandle } from "../spa/mount.ts";
import {
  makeApp,
  type App,
  type Effect,
} from "../effects/dispatch.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";
import { button, label } from "../views/nodes.ts";
import { verticalLayout } from "../views/layout.ts";
import type { Elem } from "../views/model.ts";
import { VIEWPORT } from "../spa/viewport.ts";
import { checkGroups } from "./content/check.ts";
import { clearDocsDom, wireDocsDom } from "./dom.ts";
import { NAV, type NavGroup } from "./nav.ts";
import { pageView } from "./page.ts";
import {
  generatedPages,
  pageLoaders,
  type GeneratedPage,
} from "./content/generated/registry.ts";

export type DocsHandle = SpaHandle;

// The current-entry marker drawn on the nav label.
const CURRENT = "▸ ";

interface DocsState {
  readonly page: string;
  readonly body: string | null;
  // The page whose pane heading holds DOM focus (null when none) —
  // the state path the docs-focus effect writes (task 3.2).
  readonly focus: string | null;
}

// The docs dispatch, assigned once createDocsApp builds the app — the
// handler kicks the body import through it (async applies re-draw via
// the wire's rerender path, tambor-a45).
let dispatchDocs: App["dispatch"] | null = null;

// Body loaders resolve outside the pure handler: the import result
// comes back as a body-loaded effect, which only lands when it still
// names the current page (a later select-page wins).
async function loadBody(name: string): Promise<void> {
  const load = pageLoaders[name];
  if (load === undefined) {
    throw new Error(`docs: no loader for page ${name}`);
  }
  const mod = await load();
  dispatchDocs?.([["body-loaded", name, mod.content], ["docs-focus", name]]);
}

// select-page swaps the page and drops the stale body, then schedules
// the D6 dynamic import; body-loaded stores the fetched content.
function docsHandler(state: unknown, effects: readonly Effect[]): DocsState {
  let next = state as DocsState;
  for (const effect of effects) {
    next = applyEffect(next, effect);
  }
  return next;
}

// The state step one effect makes — each effect kind is its own named
// step, so the handler keeps its complexity under the gate.
function applyEffect(state: DocsState, effect: Effect): DocsState {
  const kind = effect[0];
  const arg = effect[1];
  if (kind === "select-page" && typeof arg === "string") {
    return selectPage(arg);
  }
  if (
    kind === "body-loaded" &&
    typeof arg === "string" &&
    typeof effect[2] === "string"
  ) {
    return bodyLoaded(state, arg, effect[2]);
  }
  if (kind === "select-focus" && typeof arg === "string") {
    return selectFocus(state, arg);
  }
  return state;
}

// The page swaps, the stale body drops, and the body load starts.
function selectPage(page: string): DocsState {
  void Promise.resolve().then(() => loadBody(page));
  return { page, body: null, focus: null };
}

// The fetched body lands — only for the page still current (a load
// that lost the race lands nothing).
function bodyLoaded(state: DocsState, page: string, body: string): DocsState {
  if (page !== state.page) return state;
  return { page: state.page, body, focus: state.focus };
}

// The focus target names the page whose heading holds DOM focus — only
// for the page still current.
function selectFocus(state: DocsState, page: string): DocsState {
  if (page !== state.page) return state;
  return { page: state.page, body: state.body, focus: page };
}

// A nav entry: a real DOM control (the corpus button node paints a
// native <button>, focusable and keyboard reachable — task 3.1)
// carrying the select-page intent.
function navEntry(page: GeneratedPage, current: string): Elem {
  const text = page.name === current ? CURRENT + page.title : page.title;
  return button(text, () => [["select-page", page.name]]);
}

function navGroup(group: NavGroup, current: string): Elem[] {
  const pages = generatedPages.filter((p) => p.group === group.id);
  return [label(group.header), ...pages.map((p) => navEntry(p, current))];
}

function docsView(state: unknown): Elem {
  const s = state as DocsState;
  const page =
    generatedPages.find((p) => p.name === s.page) ?? generatedPages[0]!;
  return verticalLayout([
    ...NAV.flatMap((group) => navGroup(group, s.page)),
    ...pageView(page, s.body),
  ]);
}

function createDocsApp(): App {
  checkGroups(generatedPages);
  const app = makeApp({
    view: docsView,
    state: {
      page: generatedPages[0]!.name,
      body: null,
      focus: null,
    } satisfies DocsState,
    backend: { containerSize: VIEWPORT },
    handler: docsHandler,
  });
  // Read the dispatch at call time: the mount wraps app.dispatch with
  // the async re-draw path (tambor-a45) only after this app is built,
  // and the body load must go through that wrapper or the pane never
  // shows the loaded body.
  dispatchDocs = (batch, ...rest) => app.dispatch(batch, ...rest);
  return app;
}

export function mountDocs(doc: HostDoc, container: HostElement): DocsHandle {
  const handle = mountDemo(doc, container, createDocsApp);
  // The host seams: the keyboard activation of a nav control and the
  // focus effect's instance ref (task 3.2).
  wireDocsDom(handle.surface.host, container, handle.app, (batch) => {
    handle.app.dispatch(batch);
  });
  const unmount = handle.unmount;
  return {
    ...handle,
    unmount: () => {
      unmount();
      clearDocsDom();
    },
  };
}
