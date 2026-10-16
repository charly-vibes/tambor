// Purpose: layout-parity contracts for the real-DOM backend emission
//   (tambor-0rp — the HITL finding from tambor-y9d.4's Playwright pass).
// Responsibilities: assert that the DOM emission composites like the canvas
//   backend: the root anchors its subtree (position:relative), every emitted
//   element is absolutely positioned at its containing origin so bare groups
//   SUPERIMPOSE children at the same origin (canvas semantics), and translate
//   wrappers place their subtree at (x, y).
// Rationale: jsdom has no layout engine, so the overdraw bug the Playwright
//   pass caught in a real browser is only reachable structurally — as style
//   contracts on the emitted elements. A missing position on any builder
//   reverts that element to flow layout, which diverges from the canvas
//   semantics the corpus defines.

import { describe, expect, it } from "vitest";
import { DomBackend } from "../src/render/dom.ts";
import { label, button, rectangle, withColor } from "../src/views/model.ts";

describe("dom backend layout parity (tambor-0rp)", () => {
  it("anchors the drawn root: position relative on the root element", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    expect(backend.root.style["position"]).toBe("relative");
  });

  it("superimposes bare-group children at the same origin (canvas semantics)", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    backend.draw([
      button("Add Todo"),
      label("complete"),
    ]);
    // the array is wrapped in ONE anchoring box; its children superimpose
    const box = backend.root.children[0]!;
    const kids = box.children;
    expect(kids.length).toBe(2);
    for (const el of kids) {
      expect(el.style["position"]).toBe("absolute");
      expect(el.style["left"]).toBe("0px");
      expect(el.style["top"]).toBe("0px");
    }
  });

  it("places a translate subtree at (x, y) and anchors nested children to it", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    backend.draw({
      type: "translate",
      x: 30,
      y: 10,
      drawable: label("hi"),
    });
    const box = backend.root.children[0]!;
    expect(box.style["position"]).toBe("absolute");
    expect(box.style["left"]).toBe("30px");
    expect(box.style["top"]).toBe("10px");
    const tag = box.children[0]!;
    expect(tag.style["position"]).toBe("absolute");
    expect(tag.style["left"]).toBe("0px");
    expect(tag.style["top"]).toBe("0px");
  });

  it("anchors wrapper subtrees (with-color) at the current origin", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    backend.draw({
      type: "with-color",
      color: [0, 0, 0],
      drawables: [rectangle(10, 5)],
    });
    const wrap = backend.root.children[0]!;
    expect(wrap.style["position"]).toBe("absolute");
    const rect = wrap.children[0]!;
    expect(rect.style["position"]).toBe("absolute");
    expect(rect.style["width"]).toBe("10px");
  });
});
