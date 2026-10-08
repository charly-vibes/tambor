// Purpose: scrollview range geometry — the pure formulas of
//   components.scrollview's range_formula and div0_safe.
// Responsibilities: scrollMax(total, viewport) — the maximum offset per
//   axis is max(0, total − viewport); clampScalar(v, max) —
//   max(0, min(max, v)); div0(a, b) — division by zero yields 0, never
//   NaN or infinity.
// Rationale: specs/components-scrollview.md is the design authority —
//   range_formula states both formulas verbatim and div0_safe states the
//   zero-viewport rule; nothing here reads state or performs I/O.

import type { Vec2 } from "../../views/model.ts";

// The maximum offset per axis: max(0, total − viewport) (range_formula).
export function scrollMax(total: Vec2, viewport: Vec2): Vec2 {
  return [
    Math.max(0, total[0] - viewport[0]),
    Math.max(0, total[1] - viewport[1]),
  ];
}

// clamp(v) is max(0, min(max, v)) (range_formula).
export function clampScalar(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}

// Division by a zero viewport yields 0 and never NaN or infinity
// (div0_safe).
export function div0(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}
