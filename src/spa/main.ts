// Purpose: the SPA browser entry (tambor-e2y) — wires the mount to the
//   real document and boots the todo demo into #app.
// Responsibilities: reach the document structurally (no lib.dom — the
//   core stays DOM-free; this entry is the only DOM-touching file),
//   find the #app container (falling back to body) and hand both to
//   mountSpa.
// Rationale: tambor-e2y — the demo runs from the esbuild bundle
//   (dist/spa.js) loaded by index.html; every corpus semantic lives in
//   the backend and the example, not here.

import { mountSpa } from "./mount.ts";
import type { HostDoc } from "../interop/domhost.ts";

const doc = (globalThis as { document?: unknown }).document as
  | HostDoc
  | undefined;

if (doc !== undefined) {
  const container = doc.getElementById("app") ?? doc.body;
  mountSpa(doc, container);
}
