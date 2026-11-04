// Purpose: the docs SPA entry (add-docs-site task 2.2) — mounts the
//   docs shell through the shared spa host: journey-grouped nav
//   (getting started / guides / reference / examples, D7 reader
//   order) plus a content pane rendering the selected page module.
// Responsibilities: mountDocs(doc, container) — docs app state is the
//   current page name plus its async-loaded verbatim body; the nav
//   renders every registry page under its journey group with the
//   current entry marked (▸ prefix; task 5 layers the theme highlight
//   on top, the glyph keeps "current" legible headless), a
//   select-page effect swaps the page and kicks the D6 dynamic import
//   for the body (the wire's async-dispatch path re-draws on
//   arrival), and the pane draws title, statement, description and
//   body lines as tambor elems. checkGroups runs at mount so an
//   ungrouped page fails loud before any nav render.
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
import { label, on } from "../views/nodes.ts";
import { verticalLayout } from "../views/layout.ts";
import type { Elem } from "../views/model.ts";
import { VIEWPORT } from "../spa/viewport.ts";
import { checkGroups } from "./content/check.ts";
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
  dispatchDocs?.([["body-loaded", name, mod.content]]);
}

// select-page swaps the page and drops the stale body, then schedules
// the D6 dynamic import; body-loaded stores the fetched content.
function docsHandler(state: unknown, effects: readonly Effect[]): DocsState {
  let next = state as DocsState;
  for (const effect of effects) {
    if (effect[0] === "select-page" && typeof effect[1] === "string") {
      const page = effect[1];
      next = { page, body: null };
      void Promise.resolve().then(() => loadBody(page));
    } else if (
      effect[0] === "body-loaded" &&
      typeof effect[1] === "string" &&
      typeof effect[2] === "string" &&
      effect[1] === next.page
    ) {
      next = { page: next.page, body: effect[2] };
    }
  }
  return next;
}

function navEntry(page: GeneratedPage, current: string): Elem {
  const text = page.name === current ? CURRENT + page.title : page.title;
  return on("mouse-down", () => [["select-page", page.name]], label(text));
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
    state: { page: generatedPages[0]!.name, body: null } satisfies DocsState,
    backend: { containerSize: VIEWPORT },
    handler: docsHandler,
  });
  dispatchDocs = app.dispatch;
  return app;
}

export function mountDocs(doc: HostDoc, container: HostElement): DocsHandle {
  return mountDemo(doc, container, createDocsApp);
}
