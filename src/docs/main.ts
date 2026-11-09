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
  defaultHandler,
  CONTAINER_SIZE_KEY,
  type App,
  type Backend,
  type Effect,
  type ViewContext,
} from "../effects/dispatch.ts";
import type { Path } from "../effects/paths.ts";
import { call, render } from "../model/component.ts";
import { dropdown } from "../components/select/dropdown.ts";
import type { Options } from "../components/select/types.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";
import { button, label, withColor } from "../views/nodes.ts";
import type { Elem, Vec2 } from "../views/model.ts";
import type { DomBackend } from "../render/dom.ts";
import { VIEWPORT } from "../spa/viewport.ts";
import { wireDocsHost } from "./host.ts";
import { checkGroups } from "./content/check.ts";
import { clearDocsDom, wireDocsDom } from "./dom.ts";
import { ambientColor, resolveAmbient } from "./theme.ts";
import { CURRENT, NAV, type NavGroup } from "./nav.ts";
import { collapsedNav } from "./breakpoint.ts";
import { pageView } from "./page.ts";
import {
  generatedPages,
  pageLoaders,
  type GeneratedPage,
} from "./content/generated/registry.ts";
import { PAGE_DEMOS } from "./content/demos.ts";
import { wireDocsEmbed } from "./embeds.ts";
import { showcaseShell, stackedShell } from "./layout.ts";

export type DocsHandle = SpaHandle;

// The current-entry marker drawn on the nav label.
// (CURRENT lives in nav.ts — one home for the marker spelling.)

interface DocsState {
  readonly page: string;
  readonly body: string | null;
  // The page whose pane heading holds DOM focus (null when none) —
  // the state path the docs-focus effect writes (task 3.2).
  readonly focus: string | null;
  // The collapsed-nav dropdown (task 6): the select component writes
  // these through the dispatcher builtins — the open flag and the
  // ::extra scratch tree (component.model top-level-ui semantics, the
  // gallery's createSelectDemo shape).
  readonly "open?": boolean;
  readonly "::extra": Record<string, unknown>;
  // The showcase scroll (task 8): the docs pane's own scroll offset —
  // the wheel intents of the showcase scrollview update this path, and
  // the view rederives with it (context.scroll for the pin).
  readonly offset: Vec2;
}

// The paths the dropdown component speaks (gallery idiom).
const PAGE_PATH: Path = [["keypath", "page"]];
const OPEN_PATH: Path = [["keypath", "open?"]];
const EXTRA_ROOT: Path = [["keypath", "::extra"]];

// The state step one effect makes, carrying every untouched field —
// the dropdown's open flag and scratch tree survive navigation.
function withFields(state: DocsState, patch: Partial<DocsState>): DocsState {
  return { ...state, ...patch };
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

// The dispatcher builtins (set/update — the dropdown's selection and
// open toggle): the default handler applies the path write; a set that
// lands on the page path is page NAVIGATION, so it drops the stale
// body and kicks the import exactly like select-page.
function builtinEffect(state: DocsState, effect: Effect): DocsState {
  const next = defaultHandler(state, [effect], {}) as DocsState;
  const arg = effect[1];
  const value = effect[2];
  // Structural page-path check (A-CLAR-002): the dropdown's derived set
  // spells the same one-keypath path as PAGE_PATH; stringify-comparing
  // serialized arrays was fragile and ran per effect.
  const navigates =
    effect[0] === "set" &&
    Array.isArray(arg) &&
    arg.length === 1 &&
    (arg[0] as { keypath?: unknown }).keypath === "page" &&
    typeof value === "string" &&
    value !== state.page;
  return navigates ? selectPage(next, value as string) : next;
}

// The state step one effect makes — each effect kind is its own named
// step, so the handler keeps its complexity under the gate.
function applyEffect(state: DocsState, effect: Effect): DocsState {
  const kind = effect[0];
  const arg = effect[1];
  if (kind === "set" || kind === "update") {
    return builtinEffect(state, effect);
  }
  if (kind === "select-page" && typeof arg === "string") {
    return selectPage(state, arg);
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

// The page swaps, the stale body drops, and the body load starts —
// carrying the dropdown's open flag and scratch tree (withFields).
function selectPage(state: DocsState, page: string): DocsState {
  void Promise.resolve().then(() => loadBody(page));
  return withFields(state, { page, body: null, focus: null });
}

// The fetched body lands — only for the page still current (a load
// that lost the race lands nothing).
function bodyLoaded(state: DocsState, page: string, body: string): DocsState {
  if (page !== state.page) return state;
  return withFields(state, { body });
}

// The focus target names the page whose heading holds DOM focus — only
// for the page still current.
function selectFocus(state: DocsState, page: string): DocsState {
  // Identity-preserving no-op when the target is already the current,
  // focused page: a focus re-dispatch after a resize must NOT change
  // state identity, or the wire's stale-view window (task 6's cache
  // contract) could never be exercised — and a redundant focus effect
  // is not a change.
  if (page !== state.page) return state;
  if (state.focus === page) return state;
  return withFields(state, { focus: page });
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
  // The group header speaks the heading role (task 5: views consume
  // mapped roles from ./theme.ts, never tokens or literals). Inside the
  // layout's translate wrapper the with-color wrapper paints ink only —
  // the auto-extent background paints nothing (tambor-2jz).
  return [
    withColor(ambientColor("heading"), label(group.header)),
    ...pages.map((p) => navEntry(p, current)),
  ];
}

// The collapsed-nav dropdown (task 6.2): every registry page as a
// [name, title] option; selection writes the page path through the
// dispatcher builtins and the dropdown closes itself (select_closes).
// The gallery's createSelectDemo is the integration idiom.
function navDropdown(s: DocsState): Elem {
  const options: Options = generatedPages.map((p) => [p.name, p.title]);
  return render(
    call(
      dropdown,
      {
        selected: s.page,
        options,
        $selected: PAGE_PATH,
        "open?": s["open?"],
        "$open?": OPEN_PATH,
      },
      { extra: s["::extra"], $extra: EXTRA_ROOT },
    ),
  ) as Elem;
}

export function docsView(state: unknown, context: ViewContext): Elem {
  const s = state as DocsState;
  const page =
    generatedPages.find((p) => p.name === s.page) ?? generatedPages[0]!;
  const size = contextSize(context);
  const demo = PAGE_DEMOS[page.name];
  const wide = !collapsedNav(size[0]);
  const scroll: Vec2 = s.offset;
  // The breakpoint branch (task 6.2, design D3): below 600 px the nav
  // collapses to a top-bar dropdown; at or above it the journey-grouped
  // chrome renders. A demo page at or above the breakpoint composes the
  // showcase (task 8.2, design D5 — scrollview + scrollytelling pin);
  // everything else stacks the demo band above the prose — the pin's
  // inactive flow.
  const chrome = wide
    ? NAV.flatMap((group) => navGroup(group, s.page))
    : [navDropdown(s)];
  const prose = pageView(page, s.body, size[0]);
  return demo !== undefined && wide
    ? showcaseShell(chrome, prose, demo, scroll, size)
    : stackedShell(chrome, prose, demo, size);
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
      "open?": false,
      "::extra": {},
      offset: [0, 0],
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
  // The theme ambient resolves once per mount through the host's
  // media-query seam (task 5.2): every view derivation then reads the
  // matched scheme's token colors without touching ui/theme.
  resolveAmbient((query) => doc.matchMedia?.(query) ?? null);
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
  // The demo embed seam (task 7.2): one demo mounted over the drawn
  // slot, kept in sync by the wrapped backend.draw.
  const dropEmbed = wireDocsEmbed(doc, container, handle);
  const unmount = handle.unmount;
  return {
    ...handle,
    unmount: () => {
      dropEmbed();
      dropHost();
      unmount();
      clearDocsDom();
    },
  };
}
