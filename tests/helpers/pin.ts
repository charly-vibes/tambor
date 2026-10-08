// Purpose: shared fixtures and screen-position scans for the
//   scrollytelling-pin contract tests.
// Responsibilities: walk a rendered frame collecting its painted leaves
//   with accumulated screen positions (walkScreen/screenPos), find the
//   pin's target by its authored width marker (findTarget), unwrap the
//   pin's reserved spacer (pinSpacerHeight), and build composed
//   pin-in-scrollview frames and headless pinned apps (pinFrame,
//   pinApp).
// Rationale: specs/scrollytelling-pin.md is the design authority; the
//   ambient scrollview is the offset source and the pin composes with
//   it (no native document scroll). tambor-272 redistributes the former
//   monolithic tests/ui-mobile.test.ts; every walker here keeps
//   cyclomatic complexity ≤ 3 by pushing each decision into its own
//   small named function.

import {
  button,
  isGroup,
  rectangle,
  translate,
  type Elem,
  type HandlerNode,
  type Node,
  type SpacerNode,
  type Vec2,
} from "../../src/views/model.ts";
import { call, render } from "../../src/model/component.ts";
import { scrollview } from "../../src/components/scrollview/scrollview.ts";
import { pin } from "../../src/scrollytelling/pin.ts";
import { makeHeadlessApp, type HeadlessApp } from "../../src/app/app.ts";
import { select, type Path } from "../../src/effects/paths.ts";


// A leaf node with its accumulated screen position: every translate on
// the way down applied — the ambient scrollview frame's [-ox, -oy]
// (components.scrollview.content_translated) plus the document's own
// translates.
export interface Positioned {
  readonly node: Node;
  readonly pos: Vec2;
}

// Wrapper node types whose children pass through unchanged in screen
// coordinates: event-layer (handler/wrap/bubble) and visual-property
// wrappers. Anything else is a painted leaf.
const WRAPPER_TYPES = new Set([
  "handler",
  "wrap",
  "bubble",
  "with-color",
  "with-style",
  "with-stroke-width",
]);

// The children a node contributes to the screen walk, or null when the
// node is a painted leaf.
function drawablesOf(n: {
  readonly type?: string;
  readonly drawables?: readonly unknown[];
}): readonly unknown[] | null {
  if (n.type === undefined || !WRAPPER_TYPES.has(n.type)) return null;
  return n.drawables ?? [];
}

// A painted leaf is recorded; wrapper children are walked in place.
function recordScreen(
  n: { readonly type?: string; readonly drawables?: readonly unknown[] },
  acc: Vec2,
  out: Positioned[],
): void {
  const d = drawablesOf(n);
  if (d === null) {
    out.push({ node: n as Node, pos: acc });
    return;
  }
  for (const x of d) walkScreen(x, acc, out);
}

// One step of the screen walk: translate shifts the accumulation.
function stepScreen(
  n: { readonly type?: string; readonly drawables?: readonly unknown[]; x?: number; y?: number; drawable?: unknown },
  acc: Vec2,
  out: Positioned[],
): void {
  if (n.type === "translate") {
    walkScreen(n.drawable, [acc[0] + (n.x ?? 0), acc[1] + (n.y ?? 0)], out);
    return;
  }
  recordScreen(n, acc, out);
}

// Elements are walked one by one at the shared accumulation.
function walkAll(elems: readonly unknown[], acc: Vec2, out: Positioned[]): void {
  for (const e of elems) walkScreen(e, acc, out);
}

// Screen walk over an element or tree: null elements contribute
// nothing, arrays share the accumulation, nodes step it forward.
function walkScreen(elem: unknown, acc: Vec2, out: Positioned[]): void {
  if (elem == null) return;
  if (Array.isArray(elem)) {
    walkAll(elem, acc, out);
    return;
  }
  stepScreen(
    elem as { type?: string; drawables?: readonly unknown[]; x?: number; y?: number; drawable?: unknown },
    acc,
    out,
  );
}

// The painted leaves of a rendered frame, in painting order (later
// paints on top).
export function screenPos(elem: unknown): readonly Positioned[] {
  const out: Positioned[] = [];
  walkScreen(elem, [0, 0], out);
  return out;
}

// The pin's target element in a rendered frame, by its authored width
// marker.
export function findTarget(frame: unknown, marker: number): Vec2 {
  const hit = screenPos(frame).find(({ node }) => isMarkerOf(node, marker));
  if (hit === undefined) throw new Error("target not found in rendered frame");
  return hit.pos;
}

// A node is the pin's target marker when it is the rectangle with the
// authored marker width.
function isMarkerOf(node: unknown, marker: number): boolean {
  const n = node as Node;
  return !isGroup(n) && n.type === "rectangle" && (n as { width: number }).width === marker;
}

// The pin's reserved slot spacer: the first drawable of the pin's output
// (unwrapping the key-press boundary wrapper), as its height.
export function pinSpacerHeight(pinTree: unknown): number {
  const wrapped = pinTree as HandlerNode;
  const content = wrapped.drawables[0];
  const parts: readonly unknown[] = isGroup(content) ? content : [content];
  return reservedSpacerIn(parts).y;
}

// The spacer part of a pin's output, failing loudly when absent.
function reservedSpacerIn(parts: readonly unknown[]): SpacerNode {
  const first = parts[0];
  if (first == null || !isSpacer(first)) {
    throw new Error("expected the reserved spacer first in the pin's output");
  }
  return first as SpacerNode;
}

// A node is the reserved spacer when it is the spacer leaf.
function isSpacer(node: unknown): boolean {
  if (Array.isArray(node)) return false;
  return (node as { type?: string }).type === "spacer";
}

// One composed frame: the pin at its document slot inside a real
// scrollview with the ambient offset. context.scroll is the offset
// source — the scrollview's own stored offset, wired at the view layer
// (the scrollview component itself does not publish context).
export function pinFrame(opts: {
  readonly start: number;
  readonly duration: number;
  readonly body: Elem;
  readonly slot: Vec2;
  readonly offset: Vec2;
  readonly viewport: Vec2;
  readonly pinState?: string;
}): Elem {
  const { start, duration, body, slot, offset, viewport } = opts;
  const args: Record<string, unknown> = { duration, body, start };
  if (opts.pinState !== undefined) args["pin-state"] = opts.pinState;
  const pinTree = render(
    call(pin, args, { context: { scroll: offset } }),
  ) as Elem;
  return render(
    call(
      scrollview,
      {
        offset,
        "scroll-bounds": viewport,
        body: [translate(slot[0], slot[1], pinTree)],
      },
    ),
  ) as Elem;
}

// A headless app with a pinned document: the scrollview's stored offset
// in state, the pin's lifecycle state beside it, and the pin's target
// carrying a width marker inside its body (after a button — the last
// interactive element inside the pin).
export function pinApp(spec: {
  readonly start: number;
  readonly duration: number;
  readonly oy: number;
  readonly ox: number;
  readonly vw: number;
  readonly vh: number;
  readonly slot: Vec2;
  readonly w: number;
}): { app: HeadlessApp; $pin: Path; marker: number } {
  const marker = spec.w + 1000;
  const $pin: Path = [["keypath", "pin_state"]];
  const body: Elem = [button("next"), rectangle(marker, 30)];
  const app = makeHeadlessApp({
    state: { pin_state: "unpinned", offset: [spec.ox, spec.oy] as Vec2 },
    view: (s) => {
      const st = s as { pin_state: string; offset: Vec2 };
      const pinTree = render(
        call(
          pin,
          {
            duration: spec.duration,
            body,
            start: spec.start,
            "pin-state": st.pin_state,
            "state-path": $pin,
          },
          { context: { scroll: st.offset } },
        ),
      ) as Elem;
      return render(
        call(scrollview, {
          offset: st.offset,
          "scroll-bounds": [spec.vw, spec.vh],
          body: [translate(spec.slot[0], spec.slot[1], pinTree)],
        }),
      ) as Elem;
    },
  });
  return { app, $pin, marker };
}
