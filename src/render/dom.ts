// Purpose: the dom backend — the accessible, selectable-text backend:
//   it renders view trees as real DOM elements and shares the canvas
//   backend's input normalisation and backend services.
// Responsibilities: the BackendContract services, draw(view) building
//   an element tree under its root element with the whole-view identity
//   short-circuit and the per-frame render hint (add-runtime-invalidation),
//   attach(surface) wiring the same listeners, resize redrawing, and the
//   runtime wire. draw() bumps the opt-in §4.0 counters: draw on every
//   draw, rebuild only when the element tree is rebuilt.
// Rationale: openspec/specs/backend-render/spec.md is the design authority. The dom
//   backend draws "accessible, selectable text": labels become text
//   nodes, buttons become real button elements (natively accessible
//   and focusable), rectangles become styled divs, and wrappers nest
//   containers; unknown node types fall back to drawing their children
//   (primitive_set). Drawing produces elements — no pixels — so only
//   measureText and drawing differ between the backends
//   (backends_swappable). Input normalisation is the shared
//   normalizeDOMEvent (input_forwarded). No behavior beyond the corpus.

import { bounds, isElem, type Vec2 } from "../views/model.ts";
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
import { ambientScheme } from "../ui/ambient-theme.ts";
import type { AnyDraw } from "./primitives.ts";
import { type FrameHint } from "./dom-reuse.ts";
import {
  type BuildCtx,
  type BuiltRange,
  type DomNode,
  type DomPainter,
  buildArc,
  buildButton,
  buildChildWithReuse,
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
  settleFillExtents,
} from "./dom-painters.ts";

// The 1px pre-scale grid (cellScale > 1, tambor#1): text renders at 1px
// so the scale(k) wrapper shows one readable cell per unit, and button
// chrome is zeroed because browser-intrinsic padding/border/background
// would inflate the cell grid past the layout math.
function clampCell(el: ElementLike, tag: string): ElementLike {
  el.style["font-size"] = "1px";
  if (tag === "button") {
    el.style["border"] = "0";
    el.style["background"] = "transparent";
  }
  return el;
}

// Pointer positions arrive in real px (the scaled surface's rect is
// bounds×k) and routing is in unit space — divide the coordinates back;
// wheel deltas are also device px per tick, so they divide too. Events
// without coordinates (keyboard, clipboard) pass through untouched.
function unscaleEvent(ev: TamborEvent, k: number): TamborEvent {
  if (ev.pos === undefined && ev.delta === undefined) return ev;
  return {
    ...ev,
    ...(ev.pos !== undefined ? { pos: [ev.pos[0] / k, ev.pos[1] / k] } : {}),
    ...(ev.delta !== undefined
      ? { delta: [ev.delta[0] / k, ev.delta[1] / k] }
      : {}),
  };
}

export interface DomBackendOptions extends RuntimeOptions {
  containerSize?: Vec2;
  clipboard?: Clipboard;
  measure?: (text: string, font?: Font | null) => Vec2;
  // Where elements come from (tambor-2v8): the default is the domsim
  // recording shim; the real-DOM host adapter supplies its own factory
  // so the drawn tree lands in a live document. Draw semantics are
  // untouched — only element production is parameterized.
  createElement?: (tag: string) => ElementLike;
  // px per unit cell on the real-DOM path (tambor#1): the raw path draws
  // unit coordinates as 1px while text renders at browser size, so
  // multi-row views collapse. cellScale = k renders the tree in a 1px
  // pre-scale grid under a scale(k) wrapper inside a root sized
  // bounds(view)×k — one unit reads as k px — and divides pointer
  // positions (and wheel deltas) by k before routing; keyboard and
  // clipboard carry no coordinates and pass through. k = 1 (default)
  // draws byte-identically to no option; geometry stays in unit space
  // for routing, hit-testing and assertions.
  cellScale?: number;
}

export class DomBackend implements BackendContract {
  containerSize: Vec2;
  readonly root: ElementLike;
  drawCount = 0;
  readonly cellScale: number;
  readonly runtime: Runtime | undefined;

  private subs = new Subscriptions();
  private clipboard: Clipboard | undefined;
  private measure: (text: string, font?: Font | null) => Vec2;
  private readonly make: (tag: string) => ElementLike;
  // the persistent scale(k) wrapper under the root (cellScale > 1)
  private cellWrap: ElementLike | undefined;
  // Whole-view short-circuit state (add-runtime-invalidation §3): the
  // last drawn view identity plus the ambient conditions it was drawn
  // under; every draw re-records them, a hintless draw clears the
  // scheme so the next hinted draw cannot skip on stale ambience.
  private lastView: AnyDraw | null = null;
  // Seeded from the ambient scheme (not null): the mount's initial draw
  // is hintless, and a null seed would make the first hinted wire draw —
  // whose scheme IS the ambient one — mismatch and rebuild for nothing.
  private lastScheme: string | null = ambientScheme();
  private lastSize: Vec2 | null = null;
  // Per-child reuse state (tasks 3.5/3.6): the previous frame's
  // Elem→range map, swapped after every build.
  private reusePrev = new WeakMap<object, BuiltRange>();
  private reuseDisabled = true;
  // The current frame's render hint (see FrameHint): undefined until
  // the spa mount sets it for the next wire draw.
  frameHint: FrameHint | undefined;

  constructor(options: DomBackendOptions = {}) {
    this.containerSize = options.containerSize ?? [512, 512];
    this.clipboard = options.clipboard;
    this.measure = options.measure ?? measureUnit;
    this.cellScale = options.cellScale ?? 1;
    const baseMake =
      options.createElement ?? ((tag: string) => new SimElement(tag));
    // the clamp: at cellScale > 1 every drawn element renders on the 1px
    // pre-scale grid (the wrapper scales it back up) — text at 1px and
    // zeroed button chrome, so browser-intrinsic sizes cannot inflate the
    // cell grid (tambor#1)
    this.make =
      this.cellScale === 1
        ? baseMake
        : (tag: string) => clampCell(baseMake(tag), tag);
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
          ...(options.handler !== undefined
            ? { handler: options.handler }
            : {}),
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
  draw(view: AnyDraw): this {
    this.drawCount++;
    // Opt-in counters (add-runtime-invalidation §4.0): every draw, and
    // a rebuild only when the element tree is actually rebuilt — the
    // short-circuit skip counts as a draw with zero rebuilds. No-ops
    // while the counters are off.
    phaseTimers.count("draw");
    // Whole-view identity short-circuit (see shouldSkipDraw).
    const hint = this.frameHint;
    const skip = this.shouldSkipDraw(view, hint);
    this.lastView = view;
    // A hintless draw (mount's initial draw, non-wire callers) carries no
    // scheme information — it must PRESERVE the last known ambience, not
    // reset it to null, or the first hinted wire draw always mismatches.
    this.lastScheme = hint?.scheme ?? this.lastScheme;
    this.lastSize = [this.containerSize[0], this.containerSize[1]];
    if (skip) {
      phaseTimers.finishDraw();
      return this;
    }
    // Per-child reuse gate (task 3.6): an unknown ChangeSet frame — or
    // any hintless draw — disables splicing for this build.
    this.reuseDisabled =
      hint === undefined || hint.changes.kind !== "known";
    phaseTimers.startSpan("reconcile_layout");
    phaseTimers.count("rebuild");
    this.root.children.length = 0;
    this.build(view, this.cellTarget(view));
    phaseTimers.endSpan();
    phaseTimers.finishDraw();
    return this;
  }

  // Whole-view identity short-circuit predicate (add-runtime-invalidation
  // §3, tasks 3.1/3.2): identity-equal view + no overlay + no lane
  // movement + unchanged scheme and container size (the viewCache key)
  // + a known ChangeSet. Unknown ChangeSet forces the rebuild (never
  // stale output); a hintless draw never skips.
  private shouldSkipDraw(view: AnyDraw, hint: FrameHint | undefined): boolean {
    return (
      hint !== undefined &&
      hint.changes.kind === "known" &&
      hint.overlayNull &&
      hint.lane[0] === 0 &&
      hint.lane[1] === 0 &&
      hint.scheme === this.lastScheme &&
      this.lastView === view &&
      this.lastSize !== null &&
      this.lastSize[0] === this.containerSize[0] &&
      this.lastSize[1] === this.containerSize[1]
    );
  }

  // The build target: the anchored root at cellScale 1; otherwise the
  // persistent scale(k) wrapper, with the root sized bounds(view)×k so
  // one unit occupies k px (tambor#1). Geometry stays in unit space —
  // the wrapper transform does all the scaling.
  private cellTarget(view: AnyDraw): ElementLike {
    if (this.cellScale === 1) return this.root;
    // The stage reserves the drawn extent (bounds×k). The backend-only
    // shapes bounds() rejects — text-selection, text-cursor, unknown
    // foreign nodes, which build an empty box — keep the container
    // extent.
    const [w, h] = isElem(view) ? bounds(view) : this.containerSize;
    this.root.style["width"] = `${w * this.cellScale}px`;
    this.root.style["height"] = `${h * this.cellScale}px`;
    let wrap = this.cellWrap;
    if (wrap === undefined) {
      wrap = this.make("div");
      wrap.style["transform-origin"] = "0px 0px";
      this.cellWrap = wrap;
    }
    wrap.style["transform"] = `scale(${this.cellScale})`;
    wrap.style["width"] = `${w}px`;
    wrap.style["height"] = `${h}px`;
    wrap.children.length = 0;
    this.root.appendChild(wrap);
    return wrap;
  }

  drawView(): void {
    if (this.runtime) this.draw(this.runtime.render());
  }

  // resize: a viewport change relayouts and redraws (resize_redraws).
  resize(size: Vec2): this {
    this.containerSize = size;
    this.drawView();
    return this;
  }

  measureText(text: string, font?: Font | null): Vec2 {
    return this.measure(text, font);
  }

  indexForPosition(
    font: Font | null,
    text: string,
    x: number,
    y: number,
  ): number {
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
      if (ev) this.deliver(this.cellScale === 1 ? ev : unscaleEvent(ev, this.cellScale));
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
  build(view: AnyDraw, parent: ElementLike): this {
    if (view == null) return this;
    // One ctx per root build: the mutable style field threads the
    // with-style mode down the subtree across recursive calls
    // (tambor-0rp — a fresh ctx per recursion would drop it); the fill
    // list collects the with-color wrappers that need their extent
    // settled once the tree is attached.
    const ctx: BuildCtx = {
      make: (tag: string) => this.make(tag),
      build: (v: AnyDraw, p: ElementLike) => this.buildWith(ctx!, v, p),
      style: undefined as string | undefined,
      stroke: undefined as string | undefined,
      strokeWidth: undefined as number | undefined,
      fills: [],
      reusePrev: this.reuseDisabled
        ? undefined
        : this.reusePrev as WeakMap<object, BuiltRange> | undefined,
      reuseNext: new WeakMap<object, BuiltRange>(),
      reuseUsed: new Set<BuiltRange>(),
    };
    this.buildWith(ctx, view, parent);
    // the tree is attached bottom-up, so percentage sizes only resolve
    // now (see settleFillExtents)
    settleFillExtents(ctx);
    // this frame's ranges feed the next build's reuse (task 3.5)
    this.reusePrev = ctx.reuseNext;
    return this;
  }

  private buildWith(ctx: BuildCtx, view: AnyDraw, parent: ElementLike): this {
    if (view == null) return this;
    if (Array.isArray(view)) {
      // a bare sequence superimposes its children at the current origin
      // (canvas semantics) — the box anchors them (tambor-0rp)
      const box = ctx.make("div");
      box.style["position"] = "absolute";
      box.style["left"] = "0px";
      box.style["top"] = "0px";
      const children = view as readonly AnyDraw[];
      for (let i = 0; i < children.length; i++)
        buildChildWithReuse(ctx, children[i]!, box, i);
      parent.appendChild(box);
      return this;
    }
    const node = view as DomNode;
    const builder = BUILDERS[node.type];
    if (builder === undefined) {
      buildChildrenOf(ctx, node, parent);
      return this;
    }
    builder(ctx, node, parent);
    return this;
  }
}

// One builder per drawable type; the pass-through types (with-style,
// with-stroke-width, handler) just build their children. The painters live
// in dom-painters.ts (tambor-0rp split): every emission is absolutely
// positioned at its containing origin so the DOM composites like the canvas
// backend (bare groups superimpose; translate carries the coordinates).
const BUILDERS: Readonly<Record<string, DomPainter>> = {
  label: buildLabel,
  button: buildButton,
  rectangle: buildRectangle,
  "rounded-rectangle": buildRectangle,
  translate: buildTranslate,
  spacer: () => {},
  rotate: buildWrapperWithColor,
  scale: buildWrapperWithColor,
  scissor: buildWrapperWithColor,
  "with-color": buildWrapperWithColor,
  "with-style": buildWithStyle,
  "with-stroke-width": buildWrapperWithStrokeWidth,
  handler: buildChildrenOf,
  "text-selection": buildTextSelection,
  "text-cursor": buildTextCursor,
  image: buildImage,
  arc: buildArc,
  path: buildPath,
};
