// Purpose: the minimal DOM surface the canvas and dom backends attach
//   to — a stand-in element with the attributes, style, class list,
//   bounds and event listeners a mounted canvas exercises.
// Responsibilities: SimElement (attrs, style, classList,
//   getBoundingClientRect, addEventListener, dispatchEvent, child
//   list), SimCanvas with width/height attrs, computedStyle returning
//   kebab-case computed values, and the SimEvent shape the tests
//   dispatch.
// Rationale: openspec/specs/backend-render/spec.md is the design authority. The
//   backends are headless-renderable (headless_render), so the DOM
//   touchpoints are kept to the slice the corpus names: the canvas
//   element's backing attributes and css size (dpr_scaled), its
//   computed touch-action (touch_action_none), its bounding rect for
//   view-space coordinates (input_forwarded), key and clipboard
//   events (key_normalisation, clipboard_service). Like the interop
//   wave's host stand-ins, the shim records what the backend writes —
//   the corpus semantics live in the backend, not the shim.

export interface SimRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The DOM-ish events the backends listen for: pointer input, keyboard
// input and clipboard paste.
export interface SimEvent {
  type: "pointerdown" | "pointermove" | "pointerup" | "keydown" | "paste";
  clientX?: number | undefined;
  clientY?: number | undefined;
  key?: string | undefined;
  text?: string | undefined;
}

type Listener = (ev: SimEvent) => void;

export class SimElement {
  readonly tagName: string;
  readonly attrs: Record<string, string | number> = {};
  readonly style: Record<string, string> = {};
  readonly children: SimElement[] = [];
  textContent = "";
  rect: SimRect = { x: 0, y: 0, width: 0, height: 0 };
  private listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  get classList(): {
    add(...names: string[]): void;
    remove(...names: string[]): void;
    contains(name: string): boolean;
  } {
    const names = new Set<string>();
    const current = this.attrs["class"];
    if (typeof current === "string") for (const n of current.split(/\s+/)) if (n) names.add(n);
    return {
      add: (...added) => {
        for (const n of added) names.add(n);
        this.attrs["class"] = [...names].join(" ");
      },
      remove: (...removed) => {
        for (const n of removed) names.delete(n);
        this.attrs["class"] = [...names].join(" ");
      },
      contains: (n) => names.has(n),
    };
  }

  getBoundingClientRect(): SimRect {
    return this.rect;
  }

  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  // Invoke the registered listeners of the event's type.
  dispatch(ev: SimEvent): boolean {
    const list = this.listeners.get(ev.type);
    if (!list) return false;
    for (const fn of [...list]) fn(ev);
    return true;
  }

  appendChild(child: SimElement): SimElement {
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: string | number): void {
    this.attrs[name] = value;
  }
}

// A canvas element: the attrs the backing store is sized by.
export class SimCanvas extends SimElement {
  constructor() {
    super("canvas");
  }
}

export function createCanvas(): SimCanvas {
  return new SimCanvas();
}

// The computed style: the element's inline style with camelCase
// properties mapped to their kebab-case computed names.
export function computedStyle(el: SimElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(el.style)) {
    out[key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)] = value;
  }
  return out;
}
