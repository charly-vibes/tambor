// Purpose: the real-DOM host adapter (tambor-2v8) — the bridge that lets
//   DomBackend build its element tree in a live document instead of the
//   domsim recording shim, so a tambor view can land in a browser.
// Responsibilities: RealDomElement implementing the SimElement surface
//   over a structural HostElement (attrs → setAttribute, style writes →
//   setProperty with kebab mapping, classList/textContent/
//   getBoundingClientRect delegation, appendChild nesting so the drawn
//   tree mirrors automatically); real-DOM events mapped to the SimEvent
//   shape on listener registration while dispatch() keeps invoking the
//   original listeners; realDomFactory — the createElement factory
//   handed to DomBackend via its new option.
// Rationale: openspec/specs/backend-render/spec.md stays the design
//   authority — draw semantics are untouched, only where elements come
//   from changes. The adapter is deliberately structural (HostDoc /
//   HostElement interfaces, no lib.dom) so core stays DOM-free and
//   jsdom satisfies the seams in tests; the SPA entry module is the
//   only place that hands over the real document. Like domsim, the
//   adapter records/mirrors what the backend writes — the corpus
//   semantics live in the backend, not here.

import type { SimEvent, SimRect } from "../render/domsim.ts";

// A shim-surface listener (what DomBackend registers on attach).
type ShimListener = (ev: SimEvent) => void;

// The document seam: only element creation is needed.
export interface HostDoc {
  createElement(tag: string): HostElement;
  body: HostElement;
  getElementById(id: string): HostElement | null;
}

// The structural element surface the adapter touches — a real DOM
// element (browser or jsdom) satisfies it without lib.dom types.
export interface HostElement {
  setAttribute(name: string, value: string): void;
  style: { setProperty(name: string, value: string): void; getPropertyValue(name: string): string };
  classList: {
    add(...names: string[]): void;
    remove(...names: string[]): void;
    contains(name: string): boolean;
  };
  appendChild(child: HostElement): HostElement;
  removeChild(child: HostElement): HostElement;
  childNodes: Iterable<HostElement>;
  textContent: string;
  addEventListener(type: string, fn: (ev: unknown) => void): void;
  removeEventListener(type: string, fn: (ev: unknown) => void): void;
  dispatchEvent(ev: unknown): boolean;
  getBoundingClientRect(): { x: number; y: number; width: number; height: number };
  querySelectorAll(selectors: string): ArrayLike<HostElement> & Iterable<HostElement>;
}

// A real DOM event, read structurally (pointer/keyboard/clipboard).
interface RawDomEvent {
  type?: unknown;
  clientX?: unknown;
  clientY?: unknown;
  key?: unknown;
  clipboardData?: { getData(type: string): string } | null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Narrow a real event's type string to the SimEvent union — the
// fallback is safe because attach() only registers the five known types.
function simType(v: string | undefined, fallback: string): SimEvent["type"] {
  if (
    v === "pointerdown" || v === "pointermove" || v === "pointerup"
    || v === "keydown" || v === "paste"
  ) {
    return v;
  }
  return fallback as SimEvent["type"];
}

// camelCase → kebab-case so style writes land in real CSS.
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

// The shim's public surface, implemented structurally — NOT by
// subclassing SimElement: its textContent/style/attrs are class fields,
// and instance own-properties would shadow the delegating accessors.
export class RealDomElement {
  readonly tagName: string;
  readonly attrs: Record<string, string | number>;
  readonly style: Record<string, string>;
  readonly children: RealDomElement[] = [];
  rect: SimRect = { x: 0, y: 0, width: 0, height: 0 };
  readonly host: HostElement;
  private readonly byType = new Map<string, ShimListener[]>();
  private readonly wrapped = new Map<ShimListener, (ev: unknown) => void>();
  private readonly attrRecord = new Map<string, string | number>();

  constructor(tagName: string, doc: HostDoc) {
    this.tagName = tagName;
    this.host = doc.createElement(tagName);
    // attrs: write-through proxy — buildImage writes el.attrs directly,
    // so every record write mirrors onto the host element.
    this.attrs = new Proxy(
      {} as Record<string, string | number>,
      {
        set: (_t, key, value) => {
          const name = String(key);
          this.attrRecord.set(name, value);
          this.host.setAttribute(name, String(value));
          return true;
        },
        get: (_t, key) => this.attrRecord.get(String(key)),
      },
    );
    // style: write-through proxy with kebab mapping (the backend writes
    // kebab names; camelCase writes still land correctly in real CSS).
    this.style = new Proxy(
      {} as Record<string, string>,
      {
        set: (_t, key, value) => {
          const name = kebab(String(key));
          this.host.style.setProperty(name, String(value));
          return true;
        },
        get: (_t, key) => this.host.style.getPropertyValue(kebab(String(key))),
      },
    );
  }

  get classList(): {
    add(...names: string[]): void;
    remove(...names: string[]): void;
    contains(name: string): boolean;
  } {
    return this.host.classList;
  }

  get textContent(): string {
    return this.host.textContent;
  }

  set textContent(value: string) {
    this.host.textContent = value;
  }

  getBoundingClientRect(): SimRect {
    const r = this.host.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  appendChild(child: RealDomElement): RealDomElement {
    // The shim's rebuild pattern is children.length = 0 then appends;
    // an append into an emptied array means the tree was rebuilt, so
    // the stale mirrored children come off the host first.
    if (this.children.length === 0) {
      for (const existing of [...this.host.childNodes]) {
        this.host.removeChild(existing);
      }
    }
    this.children.push(child);
    this.host.appendChild(child.host);
    return child;
  }

  setAttribute(name: string, value: string | number): void {
    this.attrs[name] = value;
  }

  // Registration maps real DOM events to the SimEvent shape the
  // backend's forward() expects; dispatch() (the shim path) still
  // invokes the original listeners untouched.
  addEventListener(type: string, fn: ShimListener): void {
    const list = this.byType.get(type) ?? [];
    list.push(fn);
    this.byType.set(type, list);
    const wrapped = (raw: unknown): void => {
      const ev = raw as RawDomEvent;
      fn({
        type: simType(str(ev.type), type),
        clientX: num(ev.clientX),
        clientY: num(ev.clientY),
        key: str(ev.key),
        ...(ev.clipboardData ? { text: ev.clipboardData.getData("text") } : {}),
      });
    };
    this.wrapped.set(fn, wrapped);
    this.host.addEventListener(type, wrapped);
  }

  removeEventListener(type: string, fn: ShimListener): void {
    const list = this.byType.get(type);
    if (list !== undefined) {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    const wrapped = this.wrapped.get(fn);
    if (wrapped !== undefined) {
      this.wrapped.delete(fn);
      this.host.removeEventListener(type, wrapped);
    }
  }

  // Invoke the registered listeners of the event's type (shim path).
  dispatch(ev: SimEvent): boolean {
    const list = this.byType.get(ev.type);
    if (!list) return false;
    for (const fn of [...list]) fn(ev);
    return true;
  }
}

// The createElement factory handed to DomBackend's createElement option.
export function realDomFactory(
  doc: HostDoc,
): (tag: string) => RealDomElement {
  return (tag: string) => new RealDomElement(tag, doc);
}
