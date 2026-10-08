// Purpose: the canvas backend — the default backend of the corpus, a
//   Canvas2D painter that renders view trees into an image buffer,
//   sizes its backing store by devicePixelRatio, coalesces repaints
//   per animation frame, normalises and forwards input in view space,
//   mirrors interactive nodes in an offscreen accessibility tree,
//   respects safe-area insets and hosts the app runtime wire.
// Responsibilities: the BackendContract services (draw, measureText,
//   indexForPosition, copyToClipboard, subscribe), attach(surface) for
//   the mounted-canvas behaviors (dpr sizing, css size, touch-action,
//   event listeners), requestDraw with raf coalescing, resize with
//   relayout and redraw, and the observable stack depth, draw count
//   and a11y tree the predicates read.
// Rationale: specs/backend-render.md is the design authority. The
//   rasterization target is the module's own ImageBuffer through
//   image.ts's Painter — headless_render ("a view can be rendered to
//   an image buffer with no window and no mounted DOM") is the
//   canvas backend's native mode, and a mounted surface only adds the
//   backing attributes, css size, touch-action and listeners. The
//   drawing traversal covers the whole primitive_set, pushing and
//   popping one save/restore per wrapper so the stack balances
//   (transform_stack_balanced), and unknown node types fall back to
//   drawing their children. The dpr scale is the painter's base
//   matrix, so the backing store is css times dpr while the css size
//   and the coordinate space stay unchanged (dpr_scaled). No behavior
//   beyond the corpus.

import type { Vec2 } from "../views/model.ts";
import type { TamborEvent } from "../events/event.ts";
import {
  type BackendContract,
  type Clipboard,
  type Font,
  type Insets,
  type SubFn,
  Runtime,
  indexForPosition,
  measureUnit,
  type RuntimeOptions,
  Subscriptions,
} from "./backend.ts";
import {
  ImageBuffer,
  IDENTITY,
  Painter,
  matScale,
  toRGBA,
  type Color,
} from "./image.ts";
import { type SimCanvas, type SimEvent } from "./domsim.ts";
import { normalizeDOMEvent } from "./input.ts";
import { accessibilityTree, type A11yNode } from "./a11y.ts";
import type { AnyDraw } from "./primitives.ts";

// The device pixel ratio default: the host's, or 1 headless.
function hostDpr(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof dpr === "number" && dpr > 0 ? dpr : 1;
}

export interface CanvasBackendOptions extends RuntimeOptions {
  /** css pixel container size */
  containerSize?: Vec2;
  /** device pixel ratio; defaults to the host's (1 headless) */
  dpr?: number;
  /** where copyToClipboard writes */
  clipboard?: Clipboard;
  /** a custom measure, for a backend with real font metrics */
  measure?: (text: string, font?: Font | null) => Vec2;
  /** simulated safe-area insets, applied at the draw root */
  safeAreaInsets?: Insets;
}

export class CanvasBackend implements BackendContract {
  containerSize: Vec2;
  readonly dpr: number;
  image: ImageBuffer;
  readonly painter: Painter;
  a11y: readonly A11yNode[] = [];
  drawCount = 0;
  readonly runtime: Runtime | undefined;

  private subs = new Subscriptions();
  private clipboard: Clipboard | undefined;
  private measure: (text: string, font?: Font | null) => Vec2;
  private insets: Insets | undefined;
  private surface: SimCanvas | undefined;
  private scheduled = false;
  private last: AnyDraw = null;

  constructor(options: CanvasBackendOptions = {}) {
    this.containerSize = options.containerSize ?? [512, 512];
    this.dpr = options.dpr ?? hostDpr();
    this.clipboard = options.clipboard;
    this.measure = options.measure ?? measureUnit;
    this.insets = options.safeAreaInsets;
    const [w, h] = this.backingSize();
    this.image = new ImageBuffer(w, h);
    this.painter = new Painter(this.image);
    if (options.view) {
      this.runtime = new Runtime(
        { view: options.view, ...(options.state !== undefined ? { state: options.state } : {}), ...(options.handler !== undefined ? { handler: options.handler } : {}) },
        () => this.containerSize,
        () => this.clipboard,
      );
    }
  }

  private backingSize(): Vec2 {
    return [Math.round(this.containerSize[0] * this.dpr), Math.round(this.containerSize[1] * this.dpr)];
  }

  // The save-stack depth after the last draw: pushes of transforms,
  // clips and styles minus pops (transform_stack_balanced).
  get stackDepth(): number {
    return this.painter.depth;
  }

  // draw(view): rasterize the tree into the image buffer. Every draw
  // clears first (two draws of the same view produce identical
  // pixels, draw_deterministic).
  draw(view: AnyDraw): void {
    this.last = view;
    this.image.clear();
    this.painter.setMatrix(matScale(IDENTITY, this.dpr, this.dpr));
    this.drawCount++;
    this.painter.save();
    const insets = this.insets;
    if (insets) {
      // safe_area_respected: root content is inset by the insets and
      // clipped to the remaining box
      const [w, h] = this.containerSize;
      this.painter.scissor(
        insets.left,
        insets.top,
        Math.max(0, w - insets.left - insets.right),
        Math.max(0, h - insets.top - insets.bottom),
      );
      this.painter.translate(insets.left, insets.top);
    }
    this.paintTree(view);
    this.painter.restore();
    this.a11y = accessibilityTree(view);
  }

  drawView(): void {
    if (this.runtime) this.draw(this.runtime.render());
  }

  // requestDraw: multiple repaint requests in one frame produce one
  // draw (raf_coalesced).
  requestDraw(): void {
    if (this.scheduled) return;
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
      .requestAnimationFrame;
    if (typeof raf !== "function") {
      // headless host without frames: repaint immediately
      this.draw(this.last);
      return;
    }
    this.scheduled = true;
    raf(() => {
      this.scheduled = false;
      this.draw(this.last);
    });
  }

  // resize: a viewport change relayouts and redraws, passing the new
  // container size to the app (resize_redraws).
  resize(size: Vec2): void {
    this.containerSize = size;
    const [w, h] = this.backingSize();
    this.image = new ImageBuffer(w, h);
    this.painter.setBuffer(this.image);
    if (this.surface) this.syncSurface();
    this.drawView();
  }

  measureText(text: string, font?: Font | null): Vec2 {
    return this.measure(text, font);
  }

  indexForPosition(font: Font | null, text: string, x: number, y: number): number {
    return indexForPosition(this.measure, font, text, x, y);
  }

  copyToClipboard(text: string): void {
    // clipboard_service: writes where permitted
    this.clipboard?.writeText(text);
  }

  subscribe(fn: SubFn): () => void {
    return this.subs.subscribe(fn);
  }

  // attach: mount the canvas — backing attributes scaled by dpr, the
  // css size unchanged, computed touch-action none, and the event
  // listeners that normalise raw input into forwarded events.
  attach(surface: SimCanvas): void {
    this.surface = surface;
    this.syncSurface();
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

  private syncSurface(): void {
    const surface = this.surface;
    if (!surface) return;
    const [w, h] = this.containerSize;
    surface.attrs["width"] = Math.round(w * this.dpr);
    surface.attrs["height"] = Math.round(h * this.dpr);
    // the css size is unchanged (dpr_scaled)
    surface.style["width"] = `${w}px`;
    surface.style["height"] = `${h}px`;
    // the canvas disables browser panning and zoom so the router owns
    // touch (touch_action_none)
    surface.style["touchAction"] = "none";
  }

  // One forwarded event: subscribers see it, the runtime routes it,
  // and a runtime redraw is scheduled on the next frame.
  deliver(event: TamborEvent): void {
    this.subs.emit(event);
    this.runtime?.send(event);
    if (this.runtime) this.requestDraw();
  }

  // The drawing traversal over the primitive_set.
  private paintTree(view: AnyDraw): void {
    if (view == null) return;
    if (Array.isArray(view)) {
      for (const child of view as readonly AnyDraw[]) this.paintTree(child);
      return;
    }
    const painter = this.painter;
    const node = view as {
      type: string;
      drawable?: AnyDraw;
      drawables?: readonly AnyDraw[];
      text?: string;
      color?: Color;
      style?: string;
      strokeWidth?: number;
      width?: number;
      height?: number;
      radius?: number;
      points?: readonly Vec2[];
      x?: number;
      y?: number;
      cx?: number;
      cy?: number;
      theta?: number;
      checked?: boolean;
      data?: ImageBuffer;
      start?: number;
      end?: number;
    };
    switch (node.type) {
      case "label":
        painter.fillText(node.text ?? "", 0, 0);
        return;
      case "rectangle": {
        const w = node.width ?? 0;
        const h = node.height ?? 0;
        this.paintBox(0, 0, w, h);
        return;
      }
      case "rounded-rectangle": {
        const w = node.width ?? 0;
        const h = node.height ?? 0;
        const r = node.radius ?? 0;
        // fill is the box; stroke walks the rounded outline
        if (painter.mode !== "stroke") {
          const color = painter.fillStyle;
          if (color) {
            painter.fillStyle = color;
            painter.fillRect(0, 0, w, h);
          }
        }
        painter.strokeRoundedRect(0, 0, w, h, r);
        return;
      }
      case "path": {
        painter.beginPath();
        const pts = node.points ?? [];
        if (pts.length > 0) painter.moveTo(pts[0]![0], pts[0]![1]);
        for (const p of pts.slice(1)) painter.lineTo(p[0], p[1]);
        painter.stroke();
        return;
      }
      case "arc": {
        painter.beginPath();
        painter.arc(node.cx ?? 0, node.cy ?? 0, node.radius ?? 0, node.start ?? 0, node.end ?? 0);
        painter.stroke();
        return;
      }
      case "spacer":
        return;
      case "translate": {
        painter.save();
        painter.translate(node.x ?? 0, node.y ?? 0);
        this.paintTree(node.drawable ?? null);
        painter.restore();
        return;
      }
      case "rotate": {
        painter.save();
        painter.rotate(node.theta ?? 0);
        for (const child of node.drawables ?? []) this.paintTree(child);
        painter.restore();
        return;
      }
      case "scale": {
        painter.save();
        painter.scale(node.x ?? 1, node.y ?? 1);
        for (const child of node.drawables ?? []) this.paintTree(child);
        painter.restore();
        return;
      }
      case "scissor": {
        painter.save();
        painter.scissor(node.x ?? 0, node.y ?? 0, node.width ?? 0, node.height ?? 0);
        for (const child of node.drawables ?? []) this.paintTree(child);
        painter.restore();
        return;
      }
      case "with-color": {
        painter.save();
        const color = node.color ?? [0, 0, 0];
        painter.fillStyle = color;
        painter.strokeStyle = color;
        for (const child of node.drawables ?? []) this.paintTree(child);
        painter.restore();
        return;
      }
      case "with-style": {
        painter.save();
        painter.setStyle((node.style ?? "fill") as "fill" | "stroke" | "stroke-and-fill");
        for (const child of node.drawables ?? []) this.paintTree(child);
        painter.restore();
        return;
      }
      case "with-stroke-width": {
        painter.save();
        painter.lineWidth = node.strokeWidth ?? 1;
        for (const child of node.drawables ?? []) this.paintTree(child);
        painter.restore();
        return;
      }
      case "button": {
        // the button draws its label, inset by the 6 px padding
        painter.fillText(node.text ?? "", 6, 6);
        return;
      }
      case "checkbox": {
        // the ui checkbox draw: the 12 by 12 rounded square, stroked
        // gray when unchecked; when checked, the blue fill, border and
        // the white check path
        const checked = node.checked === true;
        painter.save();
        if (checked) {
          painter.fillStyle = [0.2, 0.5607843137254902, 0.9882352941176471];
          painter.fillRect(0, 0, 12, 12);
          painter.fillStyle = null;
          painter.strokeStyle = [1, 1, 1];
          painter.lineWidth = 1.5;
          painter.beginPath();
          painter.moveTo(2, 6);
          painter.lineTo(5, 9);
          painter.lineTo(10, 2);
          painter.stroke();
        } else {
          painter.setStyle("stroke");
          painter.strokeStyle = [0.6862745098039216, 0.6862745098039216, 0.6862745098039216];
          painter.lineWidth = 1;
          painter.strokeRoundedRect(0, 0, 12, 12, 2);
        }
        painter.restore();
        return;
      }
      case "handler": {
        for (const child of node.drawables ?? []) this.paintTree(child);
        return;
      }
      case "text-selection": {
        // the selected-text highlight behind text
        const keep = painter.fillStyle;
        painter.fillStyle = [0, 0, 1, 0.25];
        painter.fillRect(0, 0, node.width ?? 0, node.height ?? 0);
        painter.fillStyle = keep;
        return;
      }
      case "text-cursor": {
        // the caret: a one-cell-wide vertical bar
        const keep = painter.fillStyle;
        painter.fillStyle = [0, 0, 0];
        painter.fillRect(0, 0, 1, node.height ?? 0);
        painter.fillStyle = keep;
        return;
      }
      case "image": {
        painter.drawImage(node.data ?? checkerboard(node.width ?? 8, node.height ?? 8), 0, 0);
        return;
      }
      default: {
        // unknown node types fall back to drawing their children
        // (primitive_set)
        for (const child of node.drawables ?? []) this.paintTree(child);
        return;
      }
    }
  }

  // Paint a box honouring the current style mode: fill, stroke, or both.
  private paintBox(x: number, y: number, w: number, h: number): void {
    const painter = this.painter;
    if (painter.mode !== "stroke" && painter.fillStyle) {
      painter.fillRect(x, y, w, h);
    }
    if (painter.mode !== "fill" && painter.strokeStyle) {
      painter.strokeRect(x, y, w, h);
    }
  }
}

// The image pattern for an image primitive without pixel data.
function checkerboard(width: number, height: number): ImageBuffer {
  const buf = new ImageBuffer(width, height);
  const white = toRGBA([1, 1, 1]);
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if ((x + y) % 2 === 0) buf.set(x, y, white);
    }
  }
  return buf;
}
