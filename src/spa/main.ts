// Purpose: the SPA browser entry (tambor-e2y + tambor-cie.2 gallery) —
//   builds the demo nav and boots the selected gallery demo into #app.
// Responsibilities: reach the document structurally (no lib.dom — the
//   core stays DOM-free; this entry only touches the HostDoc surface),
//   render one nav button per gallery demo (DEMOS) plus a content
//   container, and mount the active demo via mountDemo; switching
//   demos unmounts the previous handle and mounts the next. The first
//   mount follows the query string (boot-selection.ts: ?demo=<id>), and
//   ?debug=1 opts the mount's read-only snapshot in for every mount
//   (unmount clears it, so a loading demo exposes nothing); a demo
//   whose module fails to load falls forward to the first
//   DIFFERENT demo that mounts. Falls back to body when #app is missing.
// Rationale: the gallery is mounting plumbing — nav buttons are plain
//   DOM outside the corpus; every demo's semantics live in its view +
//   state and route through the corpus wire (gallery.ts, mount.ts).
//   All DOM access stays on the structural HostDoc/HostElement seam.
//   Deep links never dead-end: ?demo=<id> opens the exact registry
//   entry, and an unloadable chunk (a stale content hash after a deploy,
//   an offline cache gap) still lands on a mountable demo — or a static
//   error — instead of a blank stage plus an unhandled rejection.

import { mountDemo, domMeasure, whenHostFontsReady, type SpaHandle } from "./mount.ts";
import { DEMOS, type DemoDef } from "./gallery.ts";
import { bootSelection } from "./boot-selection.ts";
import { configureLabelMeasure } from "../views/nodes.ts";
import type { App } from "../effects/dispatch.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";

const doc = (globalThis as { document?: unknown }).document as
  | HostDoc
  | undefined;

// One selection's candidate order: the requested demo is attempted
// first, the rest follow in registry order, so the fallback is the
// first different demo that can actually mount. No repeats — a
// rejecting module is never retried inside the same selection.
function candidateOrder(requested: number): number[] {
  const order: number[] = [requested];
  for (let i = 0; i < DEMOS.length; i++) {
    if (i !== requested) order.push(i);
  }
  return order;
}

// A .blurb paragraph on the stage — the loading placeholder, a
// mounted demo's blurb and the static all-demos-failed message. Plain
// DOM outside the corpus.
function blurb(d: HostDoc, text: string): HostElement {
  const p: HostElement = d.createElement("p");
  p.setAttribute("class", "blurb");
  p.textContent = text;
  return p;
}

if (doc !== undefined) {
  const d: HostDoc = doc;
  // The shell's font face must be ready before any view is built
  // (tambor-v3s): layout offsets come from the measure, and measuring a
  // fallback face then painting the declared one shifts labels.
  await whenHostFontsReady(d);
  // Real text metrics BEFORE any view construction (tambor-0rp): layout
  // offsets are computed at view-build time from label measures, and the
  // emitted DOM renders glyphs at browser metrics — without this the two
  // disagree and siblings overlap ('addcomplete' overdraw).
  configureLabelMeasure(domMeasure(d));
  const container = d.getElementById("app") ?? d.body;

  const nav: HostElement = d.createElement("nav");
  const content: HostElement = d.createElement("div");
  content.setAttribute("id", "demo");
  container.appendChild(nav);
  container.appendChild(content);

  let current: SpaHandle | undefined;
  let selectToken = 0;

  // Query state, parsed ONCE (boot-selection.ts): ?demo=<id> picks the
  // registry entry whose id matches exactly; absent, unknown or
  // malformed values boot the first demo. ?debug=1 is the opt-in
  // snapshot flag — nav clicks and fallback mounts reuse the same
  // value, because they are runtime state, not query state.
  // structural host view: tsconfig carries no DOM lib
  const host = globalThis as { location?: { search?: string } };
  const search = host.location?.search ?? "";
  const selection = bootSelection(search, DEMOS);

  function select(demoIndex: number): void {
    const demo = DEMOS[demoIndex]!;
    current?.unmount();
    current = undefined;
    content.textContent = "";
    // add-spa-delivery: example modules resolve through dynamic
    // import() — the gallery index renders synchronously, the demo
    // mount lands when the chunk arrives. The token drops stale loads
    // (a fast click across two nav buttons must not mount the older
    // demo after the newer one).
    const token = ++selectToken;
    const loading = blurb(d, `loading ${demo.title}…`);
    content.appendChild(loading);
    void mountAvailable(demoIndex, loading, token);
  }

  // One selection's load: the requested demo first, then — when its
  // module fails to load (a stale content hash after a deploy, an
  // offline cache gap) — the first DIFFERENT demo in registry order
  // whose load resolves. A rejecting module is never retried inside the
  // same selection, and when every demo fails the container shows a
  // static error. Both outcomes are swallowed on purpose: an unhandled
  // rejection would surface as a browser console error (Bombadil's
  // noConsoleErrors gate) and leave the stage blank.
  async function mountAvailable(
    requested: number,
    loading: HostElement,
    token: number,
  ): Promise<void> {
    for (const index of candidateOrder(requested)) {
      // a later selection supersedes this scan entirely — stop before
      // loading modules nobody will see
      if (token !== selectToken) return;
      const demo = DEMOS[index]!;
      let app: App;
      try {
        app = await demo.load();
      } catch {
        // never retried within this selection; the order has no repeats
        continue;
      }
      // the token guard: a later selection already cleared the
      // container, so a stale mount is dropped
      if (token !== selectToken) return;
      landDemo(index, demo, app, loading);
      return;
    }
    if (token !== selectToken) return;
    showUnavailable(loading);
  }

  // A demo whose module resolved lands on the stage.
  // The snapshot names the demo ACTUALLY mounted (demo.id, not the
  // requested index): on a fallback the active demo is the one whose
  // load resolved, and the handle must never name an unmounted demo.
  // The debug flag comes from the query parse above (parsed once).
  function landDemo(
    index: number,
    demo: DemoDef,
    app: App,
    loading: HostElement,
  ): void {
    content.removeChild(loading);
    // mount FIRST, blurb after (tambor-8yn): the blurb flows below the
    // drawn root in normal document order, so a grown demo pushes it
    // down instead of drawing over it (the drawn root's height now
    // tracks the drawn extent per draw).
    current = mountDemo(d, content, () => app, {
      debug: selection.debug,
      demo: demo.id,
    });
    content.appendChild(blurb(d, demo.blurb));
    markActive(index);
  }

  // The all-demos-failed state: a static message in place of the
  // loading placeholder.
  function showUnavailable(loading: HostElement): void {
    content.removeChild(loading);
    content.appendChild(blurb(d, "demo unavailable"));
    // nothing mounted, so no nav button may claim to be the active one
    markActive(-1);
  }

  // The nav's single active button is the demo actually on screen — the
  // requested one or the fallback that loaded in its place; -1 clears
  // every button for the all-demos-failed state.
  function markActive(demoIndex: number): void {
    let i = 0;
    for (const child of nav.childNodes) {
      child.setAttribute("class", i === demoIndex ? "active" : "");
      i++;
    }
  }

  DEMOS.forEach((demo, i) => {
    const btn: HostElement = d.createElement("button");
    btn.textContent = demo.title;
    btn.addEventListener("click", () => select(i));
    nav.appendChild(btn);
  });

  // Boot: the selection parsed once above (the first mount is query
  // state, later nav clicks and fallback mounts are runtime state).
  select(selection.demoIndex);

  // add-spa-delivery: register the PWA service worker from the browser
  // entry (never mount.ts — the mount is shared demo plumbing also run
  // under jsdom). Dev-safe: skipped on non-secure origins (http:// on a
  // LAN address, file://) and under automation (Playwright's
  // navigator.webdriver), so browser tests never race the cache — the
  // SW spec opts back in via the ?sw=1 query flag.
  type NavigatorLike = {
    serviceWorker?: {
      register(url: string, options?: { type?: string }): Promise<unknown>;
    };
    webdriver?: boolean;
  };
  const nav2 = (globalThis as { navigator?: NavigatorLike }).navigator;
  const secure = (globalThis as { isSecureContext?: boolean }).isSecureContext;
  const optedIn = search.includes("sw=1");
  if (
    nav2?.serviceWorker !== undefined &&
    secure === true &&
    (nav2.webdriver !== true || optedIn === true)
  ) {
    void nav2.serviceWorker.register("./sw.js", { type: "module" }).catch(() => undefined);
  }
}
