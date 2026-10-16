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

  function select(demoIndex: number): void {
    const demo = DEMOS[demoIndex]!;
    current?.unmount();
    content.textContent = "";
    const blurb: HostElement = d.createElement("p");
    blurb.setAttribute("class", "blurb");
    blurb.textContent = demo.blurb;
    content.appendChild(blurb);
    current = mountDemo(d, content, demo.create);
    let i = 0;
    for (const child of nav.childNodes) {
      if (i === demoIndex) child.setAttribute("class", "active");
      else child.setAttribute("class", "");
      i++;
    }
  }

  DEMOS.forEach((demo, i) => {
    const btn: HostElement = d.createElement("button");
    btn.textContent = demo.title;
    btn.addEventListener("click", () => select(i));
    nav.appendChild(btn);
  });

  select(0);
}
