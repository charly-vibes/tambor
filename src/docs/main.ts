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
  CONTAINER_SIZE_KEY,
  type App,
  type Backend,
  type Effect,
  type ViewContext,
} from "../effects/dispatch.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";
import { button, label, rectangle } from "../views/nodes.ts";
import { resolveStretch, verticalLayout } from "../views/layout.ts";
import { bounds } from "../views/geometry.ts";
import type { Elem, Vec2 } from "../views/model.ts";
import type { DomBackend } from "../render/dom.ts";
import { VIEWPORT } from "../spa/viewport.ts";
import { wireDocsHost } from "./host.ts";
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

// The live backend cell: mountDemo builds the app before the demo
// backend exists, so the app's backend record reads the container size
// through this cell and mountDocs fills it right after mount — every
// derivation path (wire cache, host resize) then derives against the
// live size instead of the mount-time VIEWPORT constant (task 4.2).
const liveBackend: { backend: DomBackend | null } = { backend: null };

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

function docsView(state: unknown, context: ViewContext): Elem {
  const s = state as DocsState;
  const page =
    generatedPages.find((p) => p.name === s.page) ?? generatedPages[0]!;
  const shell = verticalLayout([
    ...NAV.flatMap((group) => navGroup(group, s.page)),
    ...pageView(page, s.body),
  ]) ?? [];
  // The shell band: a full-width strip behind the shell — the live-width
  // chrome a resize reflows. The width is not drawn here: the band is
  // drawn at nominal size and resolved against the container the view
  // receives (stretch_resolved), so a resize re-derivation (layout_reflows)
  // redraws it at the live width. Task 6 branches the breakpoint variants
  // on the same width; task 5 paints the band.
  const band = rectangle(0, bounds(shell)[1], { stretchWidth: true });
  return resolveStretch([band, shell], contextSize(context));
}

// The container size a derivation is against: the render context carries
// it under the stretch key (make-app injects the backend's size; the
// docs host derives with the live box). A bare call without a context
// falls back to the mount viewport.
function contextSize(context: ViewContext): Vec2 {
  const size = context[CONTAINER_SIZE_KEY];
  if (
    Array.isArray(size) &&
    typeof size[0] === "number" &&
    typeof size[1] === "number"
  ) {
    return [size[0], size[1]];
  }
  return [VIEWPORT[0], VIEWPORT[1]];
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
    backend: appBackend(),
    handler: docsHandler,
  });
  // Read the dispatch at call time: the mount wraps app.dispatch with
  // the async re-draw path (tambor-a45) only after this app is built,
  // and the body load must go through that wrapper or the pane never
  // shows the loaded body.
  dispatchDocs = (batch, ...rest) => app.dispatch(batch, ...rest);
  return app;
}

// The app's backend record: the container size reads through the live
// cell, so derivations see the mounted backend's size once mountDocs
// fills it (and the mount viewport before that).
function appBackend(): Backend {
  return {
    get containerSize(): readonly [number, number] | null | undefined {
      const backend = liveBackend.backend;
      return backend === null ? VIEWPORT : backend.containerSize;
    },
  };
}

export function mountDocs(doc: HostDoc, container: HostElement): DocsHandle {
  const handle = mountDemo(doc, container, createDocsApp);
  liveBackend.backend = handle.backend;
  // The host seams: the keyboard activation of a nav control and the
  // focus effect's instance ref (task 3.2), and the live size source
  // (task 4.2) — observed container boxes re-derive the shell.
  wireDocsDom(handle.surface.host, container, handle.app, (batch) => {
    handle.app.dispatch(batch);
  });
  const dropHost = wireDocsHost(container, handle.backend, () =>
    docsView(handle.app.getState(), {
      [CONTAINER_SIZE_KEY]: handle.backend.containerSize,
    }),
  );
  const unmount = handle.unmount;
  return {
    ...handle,
    unmount: () => {
      dropHost();
      unmount();
      clearDocsDom();
    },
  };
}
