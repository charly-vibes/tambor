// Purpose: the text backend — the cell-grid backend of the corpus, the
//   port of terminal_todo's lanterna-style target: one cell is one
//   unit of width and height.
// Responsibilities: the BackendContract services with unit metrics,
//   draw(view) painting the tree into a character grid, send(event) as
//   the pre-normalised input path (a terminal driver delivers events,
//   not DOM), and the runtime wire.
// Rationale: specs/backend-render.md is the design authority. The text
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

  private put(state: CellState, x: number, y: number, ch: string): void {
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

  private paint(view: AnyDraw, state: CellState): void {
    if (view == null) return;
    if (Array.isArray(view)) {
      for (const child of view as readonly AnyDraw[]) this.paint(child, state);
      return;
    }
    const node = view as {
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
    };
    switch (node.type) {
      case "label": {
        const text = node.text ?? "";
        for (let i = 0; i < text.length; i++) {
          this.put(state, i, 0, text[i]!);
        }
        return;
      }
      case "rectangle":
      case "rounded-rectangle": {
        const w = Math.round(node.width ?? 0);
        const h = Math.round(node.height ?? 0);
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) this.put(state, dx, dy, "#");
        }
        return;
      }
      case "path": {
        for (const p of (node as { points?: readonly Vec2[] }).points ?? []) {
          this.put(state, p[0], p[1], "#");
        }
        return;
      }
      case "spacer":
        return;
      case "translate": {
        this.paint(node.drawable ?? null, {
          matrix: matTranslate(state.matrix, node.x ?? 0, node.y ?? 0),
          clip: state.clip,
        });
        return;
      }
      case "rotate": {
        this.paintChildren(node.drawables ?? [], {
          matrix: matRotate(state.matrix, node.theta ?? 0),
          clip: state.clip,
        });
        return;
      }
      case "scale": {
        this.paintChildren(node.drawables ?? [], {
          matrix: matScale(state.matrix, node.x ?? 1, node.y ?? 1),
          clip: state.clip,
        });
        return;
      }
      case "scissor": {
        const [x, y] = matApply(state.matrix, node.x ?? 0, node.y ?? 0);
        this.paintChildren(node.drawables ?? [], {
          matrix: state.matrix,
          clip: {
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(node.width ?? 0),
            h: Math.round(node.height ?? 0),
          },
        });
        return;
      }
      case "button": {
        const text = node.text ?? "";
        for (let i = 0; i < text.length; i++) this.put(state, 6 + i, 6, text[i]!);
        return;
      }
      case "checkbox":
        this.put(state, 0, 0, node.checked === true ? "x" : "o");
        return;
      case "text-selection":
      case "text-cursor":
      case "image":
      case "arc":
      case "with-color":
      case "with-style":
      case "with-stroke-width":
      case "handler":
        this.paintChildren(node.drawables ?? [], state);
        return;
      default: {
        // unknown node types fall back to drawing their children
        this.paintChildren(node.drawables ?? [], state);
        return;
      }
    }
  }

  private paintChildren(
    kids: readonly AnyDraw[],
    state: CellState,
  ): void {
    for (const child of kids) this.paint(child, state);
  }
}
