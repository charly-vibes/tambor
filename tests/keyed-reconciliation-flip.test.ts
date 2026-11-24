// @vitest-environment jsdom
// Purpose: the gated-filter-flip regression behind tambor-4ny (add-keyed-
//   dom-reconciliation §5.1) — with the reuse gate ON (a known ChangeSet
//   from the second add), the filter-flip draw builds through keyed
//   container records, and two arrays at different wrapper depths inside
//   one row subtree derived the SAME index-path key when wrapper painter
//   levels contributed no path segment: the second visitor adopted the
//   first's persistent box and the orphan sweep deleted the first's
//   freshly built content (row shells survived, strokes did not —
//   svg 12 -> 0 pre-fix). The §2 pin is output equality with the unkeyed
//   shape: the gated flip must draw every visible row's leaf content,
//   exactly as a fresh mount of the same state does. Extracted to its own
//   file by the pretender file_lines ceiling (mechanical split).
// Responsibilities: the 5.1 gated flip scenario only — seed 3 todos, add
//   3 (arming the gate), flip to "active", assert the svg count equals
//   the unkeyed shape (10 = 5 visible rows x 2 strokes; the seeded
//   complete third todo is hidden, and the bare first row at the list
//   origin is todoList design).
// Rationale: static test titles only (the testaruda store drifts on
//   dynamic titles); the jsdom rAF protocol matches the sibling render
//   tests (stub + pump exactly once per dispatch).
import { describe, expect, it, vi } from "vitest";

import { hostDoc } from "./helpers/runtime-invalidation-rig.ts";
import { mountSpa } from "../src/spa/todo-spa.ts";
import { FILTER_PATH, TODOS_PATH } from "../src/examples/todo/todo.ts";

function stubFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void): number => {
    frames.push(cb);
    return frames.length;
  });
  return frames;
}

describe("keyed-dom-reconciliation — container identity under the gate (add-keyed-dom-reconciliation §5.1)", () => {
  it("5.1 gated filter flip keeps every row's leaf content drawn (svg count equals the unkeyed shape)", () => {
    stubFrames();
    try {
      const doc = hostDoc();
      const container = doc.createElement("div");
      doc.body.appendChild(container);
      const spa = mountSpa(doc, container, {
        debug: true,
        mode: "immediate",
      });
      const host = spa.root.host;

      // initial: 3 todos, all -> 3 rows x 2 delete strokes
      expect(host.querySelectorAll("svg").length).toBe(6);

      // second add dispatch arms the reuse gate (known ChangeSet)
      for (let i = 0; i < 3; i++) {
        spa.app.dispatch(["add-todo", TODOS_PATH, `wip${i}`]);
      }
      expect(host.querySelectorAll("svg").length).toBe(12);

      // flip the filter: "active" hides the seeded complete third todo,
      // so 5 visible rows x 2 strokes = 10 — the gated draw must equal
      // the unkeyed shape (same count a fresh mount of this state draws)
      spa.app.dispatch(["set", FILTER_PATH, "active"]);
      expect(host.querySelectorAll("svg").length).toBe(10);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
