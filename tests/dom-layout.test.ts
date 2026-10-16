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
import { label, button, rectangle, withColor, withStrokeWidth, path } from "../src/views/model.ts";
import { arc } from "../src/render/primitives.ts";

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

  // primitive_set parity (tambor-0rp round 3): path and arc DRAW on the
  // dom backend like every other backend — an inline svg stroked at the
  // origin, invisible to hit-testing (canvas strokes don't hit-test).
  it("draws a path as a stroked svg at the origin", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    backend.draw(path([0, 0], [20, 20], [40, 0]));
    const svg = backend.root.children[0]!;
    expect(svg.tagName).toBe("svg");
    expect(svg.style["position"]).toBe("absolute");
    expect(svg.style["left"]).toBe("0px");
    expect(svg.style["top"]).toBe("0px");
    expect(svg.style["overflow"]).toBe("visible");
    expect(svg.style["pointer-events"]).toBe("none");
    const p = svg.children[0]!;
    expect(p.tagName).toBe("path");
    expect(p.attrs["d"]).toBe("M 0 0 L 20 20 L 40 0");
    expect(p.attrs["fill"]).toBe("none");
    expect(p.attrs["stroke"]).toBe("currentColor");
    // the svg viewport must cover the geometry: Chrome paints nothing
    // from a 0×0 svg viewport even with overflow:visible (tambor-0rp —
    // the blank logo world); the extent is the honest box
    expect(svg.attrs["width"]).toBe(40);
    expect(svg.attrs["height"]).toBe(20);
  });

  it("strokes a path in the with-color (canvas setStyle semantics)", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    backend.draw(withColor([0, 0, 1], path([0, 0], [10, 10])));
    const svg = backend.root.children[0]!.children[0]!;
    expect(svg.tagName).toBe("svg");
    expect(svg.children[0]!.attrs["stroke"]).toBe("rgba(0, 0, 255, 1)");
  });

  it("carries with-stroke-width into the svg stroke width", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    backend.draw(withStrokeWidth(3, path([0, 0], [10, 10])));
    const svg = backend.root.children[0]!.children[0]!;
    expect(svg.tagName).toBe("svg");
    expect(svg.children[0]!.attrs["stroke-width"]).toBe("3");
  });

  it("draws an arc as a stroked svg arc at the origin", () => {
    const backend = new DomBackend({ containerSize: [300, 300] });
    backend.draw(arc(20, 20, 10, 0, Math.PI));
    const svg = backend.root.children[0]!;
    expect(svg.tagName).toBe("svg");
    expect(svg.children[0]!.tagName).toBe("path");
    // canvas y-down angles: 0 is +x, PI/2 is +y (down) — clockwise from
    // (30,20) through the bottom to (10,20); delta PI is not large-arc
    expect(svg.children[0]!.attrs["d"]).toBe("M 30 20 A 10 10 0 0 1 10 20");
    expect(svg.children[0]!.attrs["fill"]).toBe("none");
    // the viewport covers the circle box the arc lives in
    expect(svg.attrs["width"]).toBe(30);
    expect(svg.attrs["height"]).toBe(30);
  });
});
