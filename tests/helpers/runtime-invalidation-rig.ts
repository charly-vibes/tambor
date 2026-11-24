// Purpose: shared mount rig for the runtime-invalidation contract
//   tests — the jsdom document lookup and the real-DOM mounted-app
//   handle the commit and render halves both drive.
// Responsibilities: hostDoc returns the document the jsdom test
//   environment installed (reached structurally, no lib.dom
//   reach-through); mounted mounts the given app into a fresh container
//   and draws once, so spies installed after the mount count only
//   post-mount work.
// Rationale: openspec/changes/add-runtime-invalidation/spec.md is the
//   contract authority; the split halves of the former
//   tests/runtime-invalidation.test.ts (runtime-invalidation-commits,
//   runtime-invalidation-render) both need this rig, so it lives here
//   instead of being duplicated. The module imports only src modules
//   and type imports — no test-framework dependency, no import-cycle
//   risk.

import type { App } from "../../src/effects/dispatch.ts";
import type { HostDoc } from "../../src/interop/domhost.ts";
import { mountDemo } from "../../src/spa/mount.ts";

export function hostDoc(): HostDoc {
  return (globalThis as { document?: unknown }).document as HostDoc;
}

// The mounted rig: a real-DOM mount of the given app, drawn once before
// the spies install so assertions count only post-mount work.
export function mounted(app: App) {
  const doc = hostDoc();
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const spa = mountDemo(doc, container, () => app);
  return { spa, container };
}
