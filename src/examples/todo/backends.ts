// Purpose: the example.todo's three backends — canvas, dom and
//   text-terminal — the same todo-app definition rendered and
//   click-routed identically on each (backend_portable).
// Responsibilities: canvasBackend (render → an ImageBuffer raster via
//   saveImage), domBackend (render → a DomNode tree: labels become text
//   nodes, every other node an element carrying its children),
//   textBackend (render → a cell grid, one cell per unit of width and
//   height, labels drawn as their characters and strokes as cells), and
//   routeClick — a pointer click normalised and handed to the corpus
//   event router at view-space coordinates.
// Rationale: specs/example-todo.md backend_portable ("the same
//   todo-app definition runs on the canvas, dom and text-terminal
//   backends without change") is the design authority; specs/
//   backend-render.md owns the full backend contract and primitive set,
//   so these are the example-scoped renderers the todo contracts need.
//   Click routing goes through the event router (event.model), so the
//   effect list a click produces is backend-independent. The text
//   backend's one cell per unit follows the text-backend metrics
//   advisory. No behavior beyond the corpus.

import { isGroup, type Elem, type Vec2 } from "../../views/model.ts";
import { dispatch } from "../../events/dispatch.ts";
import { mouseDown } from "../../events/event.ts";
import type { IntentList } from "../../events/bubble.ts";
import { drawTo, saveImage, sizeOf, type ImageBuffer } from "./image.ts";

// A dom-backend element: labels carry their text, every other node an
// element tagged with its node kind and its children.
export interface DomNode {
  readonly tag: string;
  readonly text?: string;
  readonly children: readonly DomNode[];
}

// A text-terminal cell grid: one cell per unit (rows × cols), row-major.
export interface CellGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly string[];
}

export interface ExampleBackend<T> {
  readonly name: "canvas" | "dom" | "text";
  render(view: Elem): T;
  routeClick(view: Elem, pos: Vec2): IntentList;
}

// A pointer click is normalised to the corpus pointer shape and handed
// to the event router at view-space coordinates.
export function routeClick(view: Elem, pos: Vec2): IntentList {
  return dispatch(view, mouseDown(pos));
}

// The canvas backend: the view drawn into an image raster.
export function canvasBackend(): ExampleBackend<ImageBuffer> {
  return { name: "canvas", render: (view) => saveImage(view), routeClick };
}

function domOf(elem: Elem): DomNode | null {
  if (elem == null) return null;
  if (isGroup(elem)) {
    return { tag: "div", children: elem.map(domOf).filter((n): n is DomNode => n !== null) };
  }
  const node = elem as { type: string; text?: string; drawable?: Elem; drawables?: readonly Elem[] };
  const kind = node.type;
  if (kind === "wrap" || kind === "bubble") {
    return {
      tag: kind,
      children: (node.drawables as readonly Elem[]).map(domOf).filter((n): n is DomNode => n !== null),
    };
  }
  if (kind === "label") {
    return node.text === undefined
      ? { tag: "span", children: [] }
      : { tag: "span", text: node.text, children: [] };
  }
  if (kind === "translate") {
    const child = domOf(node.drawable as Elem);
    return { tag: kind, children: child ? [child] : [] };
  }
  if (node.drawables !== undefined) {
    return {
      tag: kind,
      children: (node.drawables as readonly Elem[]).map(domOf).filter((n): n is DomNode => n !== null),
    };
  }
  return { tag: kind, children: [] };
}

// The dom backend: the view as accessible, selectable element text.
export function domBackend(): ExampleBackend<DomNode> {
  return {
    name: "dom",
    render: (view) => domOf(view) ?? { tag: "div", children: [] },
    routeClick,
  };
}

// The text-terminal drawing: labels place their characters, everything
// else that draws plots cells through the shared traversal.
class CharSurface {
  readonly cells: string[];
  constructor(readonly width: number, readonly height: number) {
    this.cells = new Array<string>(width * height).fill(" ");
  }
  cell(x: number, y: number, _color: unknown): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    this.cells[py * this.width + px] = "#";
  }
  chars(x: number, y: number, text: string, _color: unknown): void {
    for (let i = 0; i < text.length; i++) {
      const px = Math.round(x) + i;
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
      this.cells[py * this.width + px] = text[i] as string;
    }
  }
}

// The text backend: a cell grid, one cell per unit of width and height.
export function textBackend(): ExampleBackend<CellGrid> {
  return {
    name: "text",
    render: (view) => {
      const [w, h] = sizeOf(view);
      const cols = Math.max(1, Math.ceil(w));
      const rows = Math.max(1, Math.ceil(h));
      const surface = new CharSurface(cols, rows);
      drawTo(view, surface);
      return { cols, rows, cells: surface.cells };
    },
    routeClick,
  };
}