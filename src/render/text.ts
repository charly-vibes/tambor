// Purpose: the text backend — the cell-grid backend of the corpus, the
//   port of terminal_todo's lanterna-style target: one cell is one
//   unit of width and height.
// Responsibilities: the BackendContract services with unit metrics,
//   draw(view) painting the tree into a character grid, send(event) as
//   the pre-normalised input path (a terminal driver delivers events,
//   not DOM), and the runtime wire.
// Rationale: openspec/specs/backend-render/spec.md is the design authority. The text
//   backend treats one cell as one unit of width and height
//   (text_backend_metrics), so the unit measure is its native metrics
//   and apps are laid out in those units. Drawing paints labels as
//   characters, rectangles as filled blocks and wrappers translate and
//   clip their children; unknown node types fall back to drawing their
//   children (primitive_set). Input arrives pre-normalised: there is
//   no DOM to normalise, so send(event) delivers a TamborEvent
//   directly (input_forwarded's normalisation is the terminal driver's
//   job). No behavior beyond the corpus.

import type { Vec2 } from "../views/model.ts";
import type { TamborEvent } from "../events/event.ts";
import type { Handler, ViewFn } from "../effects/dispatch.ts";
import {
  type BackendContract,
  type Clipboard,
  type Font,
  type SubFn,
  Runtime,
  indexForPosition,
  measureUnit,
  type RuntimeOptions,
  Subscriptions,
} from "./backend.ts";
import { matApply, matRotate, matScale, matTranslate, IDENTITY, type Mat } from "./image.ts";
import type { AnyDraw } from "./primitives.ts";

export interface TextBackendOptions extends RuntimeOptions {
  /** the container size in cells */
  containerSize?: Vec2;
  clipboard?: Clipboard;
  measure?: (text: string, font?: Font | null) => Vec2;
}

// The draw transform in cell space: an affine matrix over cells.
interface CellState {
  matrix: Mat;
  clip: { x: number; y: number; w: number; h: number } | null;
}

export class TextBackend implements BackendContract {
  containerSize: Vec2;
  grid: string[][] = [];
  drawCount = 0;
  readonly runtime: Runtime | undefined;

  private subs = new Subscriptions();
  private clipboard: Clipboard | undefined;
  private measure: (text: string, font?: Font | null) => Vec2;

  constructor(options: TextBackendOptions = {}) {
    this.containerSize = options.containerSize ?? [80, 24];
    this.clipboard = options.clipboard;
    this.measure = options.measure ?? measureUnit;
    if (options.view) {
      this.runtime = new Runtime(
        {
          view: options.view,
          ...(options.state !== undefined ? { state: options.state } : {}),
          ...(options.handler !== undefined ? { handler: options.handler } : {}),
        },
        () => this.containerSize,
        () => this.clipboard,
      );
    }
  }

  // draw(view): paint the tree into a fresh cell grid.
  draw(view: AnyDraw): void {
    this.drawCount++;
    const [w, h] = this.containerSize;
    this.grid = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));
    this.paint(view, { matrix: IDENTITY, clip: null });
  }

  drawView(): void {
    if (this.runtime) this.draw(this.runtime.render());
  }

  measureText(text: string, font?: Font | null): Vec2 {
    return this.measure(text, font);
  }

  indexForPosition(font: Font | null, text: string, x: number, y: number): number {
    return indexForPosition(this.measure, font, text, x, y);
  }

  copyToClipboard(text: string): void {
    this.clipboard?.writeText(text);
  }

  subscribe(fn: SubFn): () => void {
    return this.subs.subscribe(fn);
  }

  // send: the pre-normalised input path — a terminal driver delivers
  // a TamborEvent directly.
  send(event: TamborEvent): void {
    this.subs.emit(event);
    this.runtime?.send(event);
    if (this.runtime) this.drawView();
  }

  put(state: CellState, x: number, y: number, ch: string): void {
    const p = matApply(state.matrix, x, y);
    const dx = Math.round(p[0]);
    const dy = Math.round(p[1]);
    const clip = state.clip;
    if (clip && (dx < clip.x || dx >= clip.x + clip.w || dy < clip.y || dy >= clip.y + clip.h)) {
      return;
    }
    if (dy < 0 || dy >= this.grid.length) return;
    const row = this.grid[dy]!;
    if (dx < 0 || dx >= row.length) return;
    row[dx] = ch;
  }

  paint(view: AnyDraw, state: CellState): void {
    if (view == null) return;
    if (Array.isArray(view)) {
      this.paintChildren(view as readonly AnyDraw[], state);
      return;
    }
    const node = view as PaintNode;
    const painter = PAINTERS[node.type];
    if (painter === undefined) {
      // unknown node types fall back to drawing their children
      this.paintChildren(node.drawables ?? [], state);
      return;
    }
    painter(this, node, state);
  }

  paintChildren(
    kids: readonly AnyDraw[],
    state: CellState,
  ): void {
    for (const child of kids) this.paint(child, state);
  }
}

// A drawable node, as the draw tree actually carries it.
interface PaintNode {
  type: string;
  drawable?: AnyDraw;
  drawables?: readonly AnyDraw[];
  text?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  radius?: number;
  theta?: number;
  checked?: boolean;
  points?: readonly Vec2[];
}

function paintLabel(b: TextBackend, node: PaintNode, state: CellState): void {
  const text = node.text ?? "";
  for (let i = 0; i < text.length; i++) {
    b.put(state, i, 0, text[i]!);
  }
}

function paintRectangle(b: TextBackend, node: PaintNode, state: CellState): void {
  const w = Math.round(node.width ?? 0);
  const h = Math.round(node.height ?? 0);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) b.put(state, dx, dy, "#");
  }
}

function paintPath(b: TextBackend, node: PaintNode, state: CellState): void {
  for (const p of node.points ?? []) {
    b.put(state, p[0], p[1], "#");
  }
}

function paintTranslate(b: TextBackend, node: PaintNode, state: CellState): void {
  b.paint(node.drawable ?? null, {
    matrix: matTranslate(state.matrix, node.x ?? 0, node.y ?? 0),
    clip: state.clip,
  });
}

function paintRotate(b: TextBackend, node: PaintNode, state: CellState): void {
  b.paintChildren(node.drawables ?? [], {
    matrix: matRotate(state.matrix, node.theta ?? 0),
    clip: state.clip,
  });
}

function paintScale(b: TextBackend, node: PaintNode, state: CellState): void {
  b.paintChildren(node.drawables ?? [], {
    matrix: matScale(state.matrix, node.x ?? 1, node.y ?? 1),
    clip: state.clip,
  });
}

function paintScissor(b: TextBackend, node: PaintNode, state: CellState): void {
  const [x, y] = matApply(state.matrix, node.x ?? 0, node.y ?? 0);
  b.paintChildren(node.drawables ?? [], {
    matrix: state.matrix,
    clip: {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(node.width ?? 0),
      h: Math.round(node.height ?? 0),
    },
  });
}

function paintButton(b: TextBackend, node: PaintNode, state: CellState): void {
  const text = node.text ?? "";
  for (let i = 0; i < text.length; i++) b.put(state, 6 + i, 6, text[i]!);
}

function paintCheckbox(b: TextBackend, node: PaintNode, state: CellState): void {
  b.put(state, 0, 0, node.checked === true ? "x" : "o");
}

function paintChildrenOf(b: TextBackend, node: PaintNode, state: CellState): void {
  b.paintChildren(node.drawables ?? [], state);
}

// One painter per drawable type; the pass-through types (selection,
// cursor, image, arc, the with-* wrappers, handler) just paint their
// children.
const PAINTERS: Readonly<Record<string, (b: TextBackend, node: PaintNode, state: CellState) => void>> = {
  "label": paintLabel,
  "rectangle": paintRectangle,
  "rounded-rectangle": paintRectangle,
  "path": paintPath,
  "spacer": () => {},
  "translate": paintTranslate,
  "rotate": paintRotate,
  "scale": paintScale,
  "scissor": paintScissor,
  "button": paintButton,
  "checkbox": paintCheckbox,
  "text-selection": paintChildrenOf,
  "text-cursor": paintChildrenOf,
  "image": paintChildrenOf,
  "arc": paintChildrenOf,
  "with-color": paintChildrenOf,
  "with-style": paintChildrenOf,
  "with-stroke-width": paintChildrenOf,
  "handler": paintChildrenOf,
};
