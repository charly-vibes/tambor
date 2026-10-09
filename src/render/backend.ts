// Purpose: the backend contract the three backends implement, plus the
//   services they share — text measurement, text hit-testing, the
//   clipboard handle, input subscription and the app runtime wire.
// Responsibilities: the BackendContract interface (draw, measureText,
//   indexForPosition, copyToClipboard, subscribe), Font and Insets
//   types, the unit measure (one cell per character), the shared
//   indexForPosition over a measure function, the shared
//   subscription set, and the runtime that routes forwarded events
//   through the app view and hands the intents to the handler.
// Rationale: openspec/specs/backend-render/spec.md is the design authority —
//   backend_contract ("a backend implements draw(view),
//   measureText(text, font), indexForPosition(font, text, x, y),
//   copyToClipboard(s), and an input subscription"),
//   text_backend_metrics ("the text backend treats one cell as one
//   unit of width and height"), index_for_position_inverse and
//   backends_swappable. The index over per-glyph cumulative widths is
//   monospace-equivalent: the cell containing x, clamped to 0..len, so
//   positions left of the first glyph give 0 and beyond the last give
//   len. No behavior beyond the corpus.

import { dispatch } from "../events/dispatch.ts";
import type { TamborEvent } from "../events/event.ts";
import {
  defaultHandler,
  type EffectContext,
  type Handler,
  type ViewFn,
} from "../effects/dispatch.ts";
import type { Elem, Vec2 } from "../views/model.ts";
import type { AnyDraw } from "./primitives.ts";

// A font: the port's minimal font shape — its size in cells; the
// default (unit) font is one cell per character.
export interface Font {
  readonly size: number;
}

// Safe-area insets (safe_area_respected): root content is inset by
// these on notched devices.
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

// The clipboard handle: where copyToClipboard writes.
export interface Clipboard {
  writeText(text: string): void;
}

export type SubFn = (event: TamborEvent) => void;

// The backend contract (backend_contract).
export interface BackendContract {
  draw(view: AnyDraw): void;
  measureText(text: string, font?: Font | null): Vec2;
  indexForPosition(font: Font | null, text: string, x: number, y: number): number;
  copyToClipboard(text: string): void;
  subscribe(fn: SubFn): () => void;
}

// The unit measure: one cell per character (text_backend_metrics),
// scaled by the font's size.
export function measureUnit(text: string, font?: Font | null): Vec2 {
  const size = font === undefined || font === null ? 1 : font.size;
  return [text.length * size, size];
}

// indexForPosition over a measure function: the glyph cell containing
// x, clamped to 0..len(text) (index_for_position_inverse: monotone in
// x, left of the first glyph is 0, beyond the last is len).
export function indexForPosition(
  measure: (text: string, font?: Font | null) => Vec2,
  font: Font | null,
  text: string,
  x: number,
  // single-line hit-testing: y does not move the index
  _y?: number,
): number {
  const chars = [...text];
  const len = chars.length;
  let acc = 0;
  let index = 0;
  for (let i = 0; i < len; i++) {
    const w = measure(chars[i]!, font)[0];
    if (x >= acc + w) {
      acc += w;
      index = i + 1;
    } else {
      break;
    }
  }
  return index;
}

// The app runtime wire a backend hosts when it is given a view: the
// forwarded events route through the view tree and the intents are
// handed to the handler as one effect batch (backends_swappable: the
// same app view function and state run on every backend).
export interface RuntimeOptions {
  view?: ViewFn | undefined;
  state?: unknown;
  handler?: Handler | undefined;
}

export class Runtime {
  state: unknown;
  private readonly opts: RuntimeOptions;
  private readonly containerSize: () => Vec2;
  private readonly clipboard: () => Clipboard | undefined;

  constructor(
    opts: RuntimeOptions,
    containerSize: () => Vec2,
    clipboard: () => Clipboard | undefined,
  ) {
    this.opts = opts;
    this.state = opts.state;
    this.containerSize = containerSize;
    this.clipboard = clipboard;
  }

  // The current view tree with the container size in the render
  // context, the same placement make-app uses.
  render(): Elem {
    const view = this.opts.view;
    if (!view) return [];
    const context: Record<string, unknown> = {};
    const size = this.containerSize();
    if (size !== undefined && size !== null) context["stretch/container-size"] = size;
    return view(this.state, context);
  }

  // Route one forwarded event: dispatch → intents → handler batch.
  send(event: TamborEvent): void {
    if (!this.opts.view) return;
    const intents = dispatch(this.render(), event);
    if (intents.length === 0) return;
    const ctx: EffectContext = {
      backend: {
        containerSize: this.containerSize(),
        copyToClipboard: (text: string) => this.clipboard()?.writeText(text),
      },
    };
    const handler = this.opts.handler ?? defaultHandler;
    this.state = handler(this.state, intents, ctx);
  }
}

// The subscription set the backends share: every subscriber sees every
// forwarded event, in order.
export class Subscriptions {
  private subs = new Set<SubFn>();

  subscribe(fn: SubFn): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  emit(event: TamborEvent): void {
    for (const fn of [...this.subs]) fn(event);
  }
}
