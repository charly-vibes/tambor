// Purpose: the dom backend — the accessible, selectable-text backend:
//   it renders view trees as real DOM elements and shares the canvas
//   backend's input normalisation and backend services.
// Responsibilities: the BackendContract services, draw(view) building
//   an element tree under its root element, attach(surface) wiring the
//   same listeners, resize redrawing, and the runtime wire.
// Rationale: openspec/specs/backend-render/spec.md is the design authority. The dom
//   backend draws "accessible, selectable text": labels become text
//   nodes, buttons become real button elements (natively accessible
//   and focusable), rectangles become styled divs, and wrappers nest
//   containers; unknown node types fall back to drawing their children
//   (primitive_set). Drawing produces elements — no pixels — so only
//   measureText and drawing differ between the backends
//   (backends_swappable). Input normalisation is the shared
//   normalizeDOMEvent (input_forwarded). No behavior beyond the corpus.

import type { Vec2 } from "../views/model.ts";
import type { TamborEvent } from "../events/event.ts";
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
import { SimElement, type ElementLike, type SimEvent } from "./domsim.ts";
import { normalizeDOMEvent } from "./input.ts";
import { phaseTimers } from "../events/phase-timers.ts";
import type { AnyDraw } from "./primitives.ts";
import {
  type BuildCtx,
  type DomNode,
  type DomPainter,
  buildArc,
  buildButton,
  buildChildrenOf,
  buildImage,
  buildLabel,
  buildPath,
  buildRectangle,
  buildTextCursor,
  buildTextSelection,
  buildTranslate,
  buildWithStyle,
  buildWrapperWithColor,
  buildWrapperWithStrokeWidth,
} from "./dom-painters.ts";

export interface DomBackendOptions extends RuntimeOptions {
  containerSize?: Vec2;
  clipboard?: Clipboard;
  measure?: (text: string, font?: Font | null) => Vec2;
  // Where elements come from (tambor-2v8): the default is the domsim
  // recording shim; the real-DOM host adapter supplies its own factory
  // so the drawn tree lands in a live document. Draw semantics are
  // untouched — only element production is parameterized.
  createElement?: (tag: string) => ElementLike;
}

export class DomBackend implements BackendContract {
  containerSize: Vec2;
  readonly root: ElementLike;
  drawCount = 0;
  readonly runtime: Runtime | undefined;

  private subs = new Subscriptions();
  private clipboard: Clipboard | undefined;
  private measure: (text: string, font?: Font | null) => Vec2;
  private readonly make: (tag: string) => ElementLike;


  constructor(options: DomBackendOptions = {}) {
    this.containerSize = options.containerSize ?? [512, 512];
    this.clipboard = options.clipboard;
    this.measure = options.measure ?? measureUnit;
    this.make = options.createElement ?? ((tag: string) => new SimElement(tag));
    this.root = this.make("div");
    // Anchor the drawn tree inside the mount container (tambor-0rp): the
    // emission is absolutely positioned, so without this the translate
    // wrappers anchor to the document and demo content escapes #app.
    this.root.style["position"] = "relative";
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

  // draw(view): rebuild the element tree under the root.
  // Phase-timer seam (tambor-54j.1, opt-in): the rebuild is the
  // reconcile/layout side of a draw and closes the record; the paint
  // phase reads 0 here — the dom backend produces elements, the
  // browser paints after the call (see phase-timers.ts header). The
  // seam calls are no-ops while the timers are off.
  draw(view: AnyDraw): void {
    this.drawCount++;
    phaseTimers.startSpan("reconcile_layout");
    this.root.children.length = 0;
    this.build(view, this.root);
    phaseTimers.endSpan();
    phaseTimers.finishDraw();
  }

  drawView(): void {
    if (this.runtime) this.draw(this.runtime.render());
  }

  // resize: a viewport change relayouts and redraws (resize_redraws).
  resize(size: Vec2): void {
    this.containerSize = size;
    this.drawView();
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

  // attach: the same raw-event wiring the canvas backend mounts.
  attach(surface: ElementLike): void {
    const origin = (): Vec2 => {
      const r = surface.getBoundingClientRect();
      return [r.x, r.y];
    };
    const forward = (raw: SimEvent): void => {
      const ev = normalizeDOMEvent(raw, origin());
      if (ev) this.deliver(ev);
    };
    surface.addEventListener("pointerdown", forward);
    surface.addEventListener("pointermove", forward);
    surface.addEventListener("pointerup", forward);
    surface.addEventListener("keydown", forward);
    surface.addEventListener("paste", forward);
  }

  // One forwarded event: subscribers see it, the runtime routes it.
  deliver(event: TamborEvent): void {
    this.subs.emit(event);
    this.runtime?.send(event);
    if (this.runtime) this.drawView();
  }

  // The element-building traversal (primitive_set): one builder per
  // drawable type behind the BUILDERS dispatch table; unknown node
  // types fall back to drawing their children.
  build(view: AnyDraw, parent: ElementLike): void {
    if (view == null) return;
    // One ctx per root build: the mutable style field threads the
    // with-style mode down the subtree across recursive calls
    // (tambor-0rp — a fresh ctx per recursion would drop it).
    const ctx: BuildCtx = {
      make: (tag: string) => this.make(tag),
      build: (v: AnyDraw, p: ElementLike) => this.buildWith(ctx!, v, p),
      style: undefined as string | undefined,
      stroke: undefined as string | undefined,
      strokeWidth: undefined as number | undefined,
    };
    this.buildWith(ctx, view, parent);
  }

  private buildWith(ctx: BuildCtx, view: AnyDraw, parent: ElementLike): void {
    if (view == null) return;
    if (Array.isArray(view)) {
      // a bare sequence superimposes its children at the current origin
      // (canvas semantics) — the box anchors them (tambor-0rp)
      const box = ctx.make("div");
      box.style["position"] = "absolute";
      box.style["left"] = "0px";
      box.style["top"] = "0px";
      for (const child of view as readonly AnyDraw[]) ctx.build(child, box);
      parent.appendChild(box);
      return;
    }
    const node = view as DomNode;
    const builder = BUILDERS[node.type];
    if (builder === undefined) {
      buildChildrenOf(ctx, node, parent);
      return;
    }
    builder(ctx, node, parent);
  }
}

// One builder per drawable type; the pass-through types (with-style,
// with-stroke-width, handler) just build their children. The painters live
// in dom-painters.ts (tambor-0rp split): every emission is absolutely
// positioned at its containing origin so the DOM composites like the canvas
// backend (bare groups superimpose; translate carries the coordinates).
const BUILDERS: Readonly<Record<string, DomPainter>> = {
  "label": buildLabel,
  "button": buildButton,
  "rectangle": buildRectangle,
  "rounded-rectangle": buildRectangle,
  "translate": buildTranslate,
  "spacer": () => {},
  "rotate": buildWrapperWithColor,
  "scale": buildWrapperWithColor,
  "scissor": buildWrapperWithColor,
  "with-color": buildWrapperWithColor,
  "with-style": buildWithStyle,
  "with-stroke-width": buildWrapperWithStrokeWidth,
  "handler": buildChildrenOf,
  "text-selection": buildTextSelection,
  "text-cursor": buildTextCursor,
  "image": buildImage,
  "arc": buildArc,
  "path": buildPath,
};


