// Purpose: the SPA browser entry (tambor-e2y + tambor-cie.2 gallery) —
//   builds the demo nav and boots the selected gallery demo into #app.
// Responsibilities: reach the document structurally (no lib.dom — the
//   core stays DOM-free; this entry only touches the HostDoc surface),
//   render one nav button per gallery demo (DEMOS) plus a content
//   container, and mount the active demo via mountDemo; switching
//   demos unmounts the previous handle and mounts the next. Falls back
//   to body when #app is missing.
// Rationale: the gallery is mounting plumbing — nav buttons are plain
//   DOM outside the corpus; every demo's semantics live in its view +
//   state and route through the corpus wire (gallery.ts, mount.ts).
//   All DOM access stays on the structural HostDoc/HostElement seam.

import { mountDemo, domMeasure, type SpaHandle } from "./mount.ts";
import { DEMOS } from "./gallery.ts";
import { configureLabelMeasure } from "../views/nodes.ts";
import type { HostDoc, HostElement } from "../interop/domhost.ts";

const doc = (globalThis as { document?: unknown }).document as
  | HostDoc
  | undefined;

if (doc !== undefined) {
  const d: HostDoc = doc;
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
    const loading: HostElement = d.createElement("p");
    loading.setAttribute("class", "blurb");
    loading.textContent = `loading ${demo.title}…`;
    content.appendChild(loading);
    void demo.load().then((app) => {
      if (token !== selectToken) return;
      content.removeChild(loading);
      // mount FIRST, blurb after (tambor-8yn): the blurb flows below the
      // drawn root in normal document order, so a grown demo pushes it
      // down instead of drawing over it (the drawn root's height now
      // tracks the drawn extent per draw).
      current = mountDemo(d, content, () => app);
      const blurb: HostElement = d.createElement("p");
      blurb.setAttribute("class", "blurb");
      blurb.textContent = demo.blurb;
      content.appendChild(blurb);
      let i = 0;
      for (const child of nav.childNodes) {
        if (i === demoIndex) child.setAttribute("class", "active");
        else child.setAttribute("class", "");
        i++;
      }
    });
  }

  DEMOS.forEach((demo, i) => {
    const btn: HostElement = d.createElement("button");
    btn.textContent = demo.title;
    btn.addEventListener("click", () => select(i));
    nav.appendChild(btn);
  });

  select(0);

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
  const optedIn = (globalThis as { location?: { search?: string } }).location?.search?.includes(
    "sw=1",
  );
  if (
    nav2?.serviceWorker !== undefined &&
    secure === true &&
    (nav2.webdriver !== true || optedIn === true)
  ) {
    void nav2.serviceWorker.register("./sw.js", { type: "module" }).catch(() => undefined);
  }
}
