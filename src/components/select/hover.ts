// Purpose: the per-row hover storage of components.select — extra keys
//   made of the hover marker and the row value.
// Responsibilities: the hover marker constant, the extra key for a row
//   value, and the flag read. Hover enter/leave effect shapes are the
//   rows' concern in list.ts (set true on a mouse-move over the body,
//   set false on a global mouse-move outside), per components.hover.
// Rationale: specs/components-select.md row_hover_keyed is the design
//   authority: "row hover flags are stored in extra under a key made of
//   the hover marker and the row value, so rows hover independently".
//   The marker is the hover? prop of components.hover; the key encodes
//   the pair [hover?, value] as data so distinct row values never
//   collide.

export const HOVER_MARKER = "hover?";

// The extra key under which a row's hover flag lives.
export function hoverKey(value: unknown): string {
  return JSON.stringify([HOVER_MARKER, value]);
}

// A row's hover flag, read from the component's extra.
export function hoverFlag(extra: unknown, value: unknown): boolean {
  return (extra as Record<string, unknown> | undefined)?.[hoverKey(value)] === true;
}
