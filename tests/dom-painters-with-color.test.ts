// @vitest-environment jsdom
// Purpose: the with-color fill wrapper's emitted box on the real-DOM
//   backend — a fill wrapper must paint the area of the shape it wraps
//   even when its percentage size resolves against a zero-area
//   containing block (the selected-row accent fill).
// Responsibilities: assert the collapsed fill wrapper is sized from the
//   shape it wraps; assert the 100% containing-origin default is kept
//   where the containing block has a box (normal flow, including the
//   current label sizing); assert a text-only wrapper stays ink-only
//   (glyph color, no fill chip behind the glyphs); assert sizing the
//   wrapper never moves its children off their absolute offsets.
// Rationale: jsdom has no layout engine, so getBoundingClientRect()
//   reports 0×0 for every element — exactly the state of the dropdown
//   body, an absolutely positioned group whose only children are
//   absolute, so it has no size of its own and width/height:100% inside
//   it resolves to nothing: the blue selected row never painted. The
//   in-flow case stubs a real box onto the element prototype, the only
//   way jsdom can distinguish the two. The emitted sizes come from the
//   corpus geometry the painters already consume (rectangle
//   width/height), never from a second layout path.

import { describe, expect, it } from "vitest";

import { DomBackend } from "../src/render/dom.ts";
import type { ElementLike, SimRect } from "../src/render/domsim.ts";
import {
  RealDomElement,
  realDomFactory,
  type HostDoc,
} from "../src/interop/domhost.ts";
import {
  label,
  on,
  rectangle,
  spacer,
  translate,
  withColor,
  withStyle,
  type Elem,
} from "../src/views/model.ts";

// components.select.row_visuals: the accent fill [0, 0.48, 1] and the
// white label. jsdom's CSSOM serialises an opaque rgba() as rgb().
// The accent is a token ink: style properties emit var(--tambor-accent)
// (the browser resolves it at paint time). The white is background-light,
// deliberately NOT mapped — a surface token is never an ink, so the
// selected-row label stays literal white in both schemes.
const ACCENT: readonly number[] = [0, 0.48, 1];
const WHITE: readonly number[] = [1, 1, 1];
const ACCENT_CSS = "var(--tambor-accent)";
const WHITE_CSS = "rgb(255, 255, 255)";

// The jsdom document, reached structurally (no lib.dom in tsconfig):
// the global scope carries it only under jsdom, so narrow, then cast the
// checked value to the host adapter's structural seam.
function hostDoc(): HostDoc {
  // structural seam: the repo tsconfig has no DOM lib; under jsdom the
  // global document is the host adapter's document
  const doc: unknown = (globalThis as { document?: unknown }).document;
  if (typeof doc !== "object" || doc === null) {
    throw new Error("no jsdom document");
  }
  return doc as HostDoc;
}

// Every drawn element under the backend root, in document order.
function drawn(el: ElementLike): ElementLike[] {
  const out: ElementLike[] = [];
  for (const child of el.children) {
    out.push(child);
    out.push(...drawn(child));
  }
  return out;
}

// The px number a `NNpx` inline value carries; NaN for percentages.
function px(value: string | undefined): number {
  const v = value ?? "";
  return v.endsWith("px") ? Number(v.slice(0, -2)) : Number.NaN;
}

// The selected dropdown row as src/components/select/list.ts draws it:
// a translate carrying the handler whose visuals are the spacer, the
// accent fill and the white label — all of it inside a zero-area body.
function selectedRow(): Elem {
  return translate(
    0,
    20,
    on(
      "mouse-down",
      () => null,
      spacer(60, 20),
      withColor(ACCENT, rectangle(60, 20)),
      withColor(WHITE, label("one")),
    ),
  );
}

// The one method the layout stub patches on jsdom's element prototype.
interface Measured {
  getBoundingClientRect?: () => SimRect;
}

// jsdom lays nothing out: hand every element a containing box so a
// percentage size resolves (the in-flow world). Returns the restore.
function stubBox(
  doc: HostDoc,
  width: number,
  height: number,
): () => void {
  // jsdom's Element.prototype — the adapter delegates the rect read to
  // the host element, so patching the prototype models every box at once
  const proto = Object.getPrototypeOf(doc.createElement("div")) as Measured;
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = (): SimRect => ({
    x: 0,
    y: 0,
    width,
    height,
  });
  return () => {
    if (original === undefined) delete proto.getBoundingClientRect;
    else proto.getBoundingClientRect = original;
  };
}

function mount(doc: HostDoc, view: Elem): DomBackend {
  const backend = new DomBackend({ createElement: realDomFactory(doc) });
  doc.body.appendChild((backend.root as RealDomElement).host);
  backend.draw(view);
  return backend;
}

describe("dom backend with-color fill extent", () => {
  // The defect: the wrapper's 100% width/height resolves against the
  // zero-area dropdown body, so the accent background covers 0×0 and
  // the selected row paints no blue at all.
  it("sizes a collapsed fill wrapper to the shape it wraps", () => {
    const doc = hostDoc();
    const backend = mount(doc, selectedRow());
    const all = drawn(backend.root);

    const fill = all.find((el) => el.style["background"] === ACCENT_CSS);
    expect(fill).toBeDefined();
    // the wrapper's own background is the row's fill
    expect(fill?.style["background"]).toBe(ACCENT_CSS);

    const rect = fill?.children.find(
      (child) => child.style["width"] === "60px",
    );
    expect(rect).toBeDefined();
    expect(rect?.style["height"]).toBe("20px");

    // the wrapper's box must cover the rectangle it wraps
    expect(px(fill?.style["width"])).toBeGreaterThanOrEqual(
      px(rect?.style["width"]),
    );
    expect(px(fill?.style["height"])).toBeGreaterThanOrEqual(
      px(rect?.style["height"]),
    );
    expect(px(fill?.style["width"])).toBe(60);
    expect(px(fill?.style["height"])).toBe(20);
  });

  // Normal flow keeps the containing-origin default: a fill wrapper
  // whose percentage resolves to a real box is unchanged.
  it("keeps the 100% default where the containing block has a box", () => {
    const doc = hostDoc();
    const restore = stubBox(doc, 300, 200);
    try {
      const backend = mount(doc, withColor(ACCENT, rectangle(60, 20)));
      const fill = drawn(backend.root).find(
        (el) => el.style["background"] === ACCENT_CSS,
      );
      expect(fill?.style["width"]).toBe("100%");
      expect(fill?.style["height"]).toBe("100%");
    } finally {
      restore();
    }
  });

  // The white selected label: canvas fillStyle colors glyphs and paints
  // no area behind them, so the wrapper's ink must stay on the span and
  // the wrapper must not grow a white chip over the accent row.
  it("keeps a text-only wrapper ink-only in a sized containing block", () => {
    const doc = hostDoc();
    const restore = stubBox(doc, 300, 200);
    try {
      const backend = mount(doc, withColor(WHITE, label("one")));
      const wrap = drawn(backend.root).find(
        (el) => el.style["background"] === WHITE_CSS,
      );
      expect(wrap).toBeDefined();
      expect(wrap?.style["width"]).toBe("100%");
      expect(wrap?.style["height"]).toBe("100%");
      const span = wrap?.children.find((el) => el.tagName === "span");
      expect(span?.style["color"]).toBe(WHITE_CSS);
      expect(span?.textContent).toBe("one");
    } finally {
      restore();
    }
  });

  // Sizing the wrapper must not change the position semantics of its
  // children: absolute children stay at their offsets, and geometry a
  // translate moved off the origin is left to its own layer (a 100%
  // wrapper keeps the emitted inline size — no inventable box).
  it("leaves absolute and translated children at their offsets", () => {
    const doc = hostDoc();
    const backend = mount(
      doc,
      translate(
        0,
        20,
        withColor(ACCENT, translate(4, 6, rectangle(10, 10))),
      ),
    );
    const all = drawn(backend.root);

    const fill = all.find((el) => el.style["background"] === ACCENT_CSS);
    expect(fill).toBeDefined();
    // the offset shape is not the wrapper's area: the percentage default
    // stands and nothing is repainted from the origin
    expect(fill?.style["width"]).toBe("100%");
    expect(fill?.style["height"]).toBe("100%");

    const moved = fill?.children.find((el) => el.style["left"] === "4px");
    expect(moved).toBeDefined();
    expect(moved?.style["top"]).toBe("6px");
    expect(moved?.style["position"]).toBe("absolute");
    const rect = moved?.children[0];
    expect(rect?.style["width"]).toBe("10px");
    expect(rect?.style["position"]).toBe("absolute");
  });

  // Stroke mode is untouched: no background and no emitted size — the
  // border carries the ink.
  it("leaves the stroke path unchanged", () => {
    const doc = hostDoc();
    const backend = mount(
      doc,
      withStyle("stroke", withColor(ACCENT, rectangle(60, 20))),
    );
    const all = drawn(backend.root);
    const fill = all.find((el) => el.style["background"] === ACCENT_CSS);
    expect(fill).toBeUndefined();

    // the wrapper is the element holding the rectangle it strokes
    const rect = all.find((el) => el.style["width"] === "60px");
    expect(rect).toBeDefined();
    const wrap = all.find((el) => el.children.includes(rect!));
    expect(wrap).toBeDefined();
    expect(wrap?.style["width"]).toBe("");
    expect(wrap?.style["height"]).toBe("");
  });
});

// Token-derived inks on STYLE properties emit the custom property so the
// browser resolves them at paint time per the live scheme (the
// dark-scheme audit: the per-call JS resolve cannot win when Chromium's
// emulated prefers-color-scheme flips without a change event and the
// render cache replays a string). Excluded on purpose: `background` (a
// surface token, never an ink — white stays literal white) and `danger`
// (the todo delete-X stroke is an svg ATTRIBUTE, which cannot carry
// var(); its corpus red pin must stay byte-stable).
describe("dom backend token ink var() emission", () => {
  // the muted inactive ink (toggle_render's unselected options) is the
  // muted token: the label span carries the property, nothing else
  it("emits the muted custom property for a muted label", () => {
    const doc = hostDoc();
    const backend = mount(doc, withColor([0.45, 0.45, 0.45], label("off")));
    const span = drawn(backend.root).find((el) => el.tagName === "span");
    expect(span?.style["color"]).toBe("var(--tambor-muted)");
  });

  // white [1, 1, 1] is background-light, and background is excluded:
  // mapping it would paint the selected-row label dark on the dark scheme
  it("emits literal rgb for a non-ink-token color", () => {
    const doc = hostDoc();
    const backend = mount(doc, withColor(WHITE, label("one")));
    const span = drawn(backend.root).find((el) => el.tagName === "span");
    expect(span?.style["color"]).toBe(WHITE_CSS);
  });

  // danger is excluded from the mapping: the delete-X stroke red is
  // painted through an svg stroke ATTRIBUTE elsewhere and its [1, 0, 0]
  // string is pinned by the corpus — it must stay the literal rgba
  it("emits the literal rgba for a danger ink", () => {
    const doc = hostDoc();
    const backend = mount(doc, withColor([1, 0, 0], label("delete")));
    const span = drawn(backend.root).find((el) => el.tagName === "span");
    // jsdom's CSSOM serialises an opaque rgba() as rgb()
    expect(span?.style["color"]).toBe("rgb(255, 0, 0)");
  });
});