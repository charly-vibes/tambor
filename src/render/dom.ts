// Purpose: the dom backend — the accessible, selectable-text backend:
//   it renders view trees as real DOM elements and shares the canvas
//   backend's input normalisation and backend services.
// Responsibilities: the BackendContract services, draw(view) building
//   an element tree under its root element, attach(surface) wiring the
//   same listeners, resize redrawing, and the runtime wire.
// Rationale: specs/backend-render.md is the design authority. The dom
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
import { SimElement, type SimCanvas, type SimEvent } from "./domsim.ts";
import { normalizeDOMEvent } from "./input.ts";
import type { AnyDraw } from "./primitives.ts";
import type { Color } from "../views/model.ts";

export interface DomBackendOptions extends RuntimeOptions {
  containerSize?: Vec2;
  clipboard?: Clipboard;
  measure?: (text: string, font?: Font | null) => Vec2;
}

export class DomBackend implements BackendContract {
  containerSize: Vec2;
  readonly root: SimElement;
  drawCount = 0;
  readonly runtime: Runtime | undefined;

  private subs = new Subscriptions();
  private clipboard: Clipboard | undefined;
  private measure: (text: string, font?: Font | null) => Vec2;
  private surface: SimCanvas | undefined;

  constructor(options: DomBackendOptions = {}) {
    this.containerSize = options.containerSize ?? [512, 512];
    this.clipboard = options.clipboard;
    this.measure = options.measure ?? measureUnit;
    this.root = new SimElement("div");
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
  draw(view: AnyDraw): void {
    this.drawCount++;
    this.root.children.length = 0;
    this.build(view, this.root);
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
  attach(surface: SimCanvas): void {
    this.surface = surface;
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

  // The element-building traversal (primitive_set).
  private build(view: AnyDraw, parent: SimElement): void {
    if (view == null) return;
    if (Array.isArray(view)) {
      const box = new SimElement("div");
      for (const child of view as readonly AnyDraw[]) this.build(child, box);
      parent.appendChild(box);
      return;
    }
    const node = view as {
      type: string;
      drawable?: AnyDraw;
      drawables?: readonly AnyDraw[];
      text?: string;
      color?: Color;
      style?: string;
      width?: number;
      height?: number;
      x?: number;
      y?: number;
    };
    switch (node.type) {
      case "label": {
        const el = new SimElement("span");
        el.textContent = node.text ?? "";
        parent.appendChild(el);
        return;
      }
      case "button": {
        // a real button element: natively accessible and selectable
        const el = new SimElement("button");
        el.textContent = node.text ?? "";
        parent.appendChild(el);
        return;
      }
      case "rectangle":
      case "rounded-rectangle": {
        const el = new SimElement("div");
        el.style["width"] = `${node.width ?? 0}px`;
        el.style["height"] = `${node.height ?? 0}px`;
        const color = nodeColor(node);
        if (color) el.style["background"] = color;
        parent.appendChild(el);
        return;
      }
      case "translate": {
        const el = new SimElement("div");
        el.style["position"] = "absolute";
        el.style["left"] = `${node.x ?? 0}px`;
        el.style["top"] = `${node.y ?? 0}px`;
        this.build(node.drawable ?? null, el);
        parent.appendChild(el);
        return;
      }
      case "spacer":
        return;
      case "rotate":
      case "scale":
      case "scissor":
      case "with-color": {
        // the color paints the wrapper's background
        const el = new SimElement("div");
        const color = nodeColor(node);
        if (color) el.style["background"] = color;
        for (const child of node.drawables ?? []) this.build(child, el);
        parent.appendChild(el);
        return;
      }
      case "with-style":
      case "with-stroke-width":
      case "handler": {
        const el = new SimElement("div");
        for (const child of node.drawables ?? []) this.build(child, el);
        parent.appendChild(el);
        return;
      }
      case "text-selection": {
        const el = new SimElement("span");
        el.style["background"] = "rgba(0, 0, 255, 0.25)";
        parent.appendChild(el);
        return;
      }
      case "text-cursor": {
        const el = new SimElement("span");
        el.style["width"] = "1px";
        el.style["height"] = `${node.height ?? 0}px`;
        parent.appendChild(el);
        return;
      }
      case "image": {
        const el = new SimElement("img");
        el.attrs["width"] = node.width ?? 0;
        el.attrs["height"] = node.height ?? 0;
        parent.appendChild(el);
        return;
      }
      case "arc": {
        // no dom element for an arc: it contributes its (empty) box
        parent.appendChild(new SimElement("div"));
        return;
      }
      case "path": {
        parent.appendChild(new SimElement("div"));
        return;
      }
      default: {
        // unknown node types fall back to drawing their children
        const el = new SimElement("div");
        for (const child of node.drawables ?? []) this.build(child, el);
        parent.appendChild(el);
        return;
      }
    }
  }
}

function nodeColor(node: { color?: Color; style?: string }): string | undefined {
  const c = node.color;
  if (!c || node.style === "stroke") return undefined;
  const a = c[3] ?? 1;
  return `rgba(${Math.round((c[0] ?? 0) * 255)}, ${Math.round((c[1] ?? 0) * 255)}, ${Math.round((c[2] ?? 0) * 255)}, ${a})`;
}
