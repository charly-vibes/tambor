// Purpose: the canvas backend's offscreen accessibility tree — the
//   mirror of a view's interactive nodes.
// Responsibilities: the A11yNode record (role, label, checked) and
//   accessibilityTree(view): one accessible node per interactive node
//   (button, checkbox), in draw order, traversing groups, wrappers,
//   handlers, translates and unknown nodes' children.
// Rationale: specs/backend-render.md is the design authority —
//   a11y_mirror ("the canvas backend keeps an offscreen accessibility
//   tree mirroring interactive nodes") and p_a11y ("views with
//   buttons: one accessible node per interactive node"). Buttons mirror
//   with their label text and checkboxes with their checked state;
//   everything else contributes no node of its own but is traversed.
//   No behavior beyond the corpus.

import type { AnyDraw } from "./primitives.ts";

export interface A11yNode {
  readonly role: "button" | "checkbox";
  readonly label?: string | undefined;
  readonly checked?: boolean | undefined;
}

// The offscreen accessibility tree of a view (a11y_mirror).
export function accessibilityTree(view: AnyDraw): readonly A11yNode[] {
  const out: A11yNode[] = [];
  collect(view, out);
  return out;
}

function collect(elem: AnyDraw, out: A11yNode[]): void {
  if (elem == null) return;
  if (Array.isArray(elem)) {
    for (const child of elem as readonly AnyDraw[]) collect(child, out);
    return;
  }
  const node = elem as {
    type: string;
    text?: string;
    checked?: boolean;
    drawable?: unknown;
    drawables?: readonly unknown[];
  };
  switch (node.type) {
    case "button":
      out.push({ role: "button", label: node.text ?? "" });
      return;
    case "checkbox":
      out.push({ role: "checkbox", checked: node.checked === true });
      return;
    case "translate":
      if (node.drawable !== undefined) collect(node.drawable as AnyDraw, out);
      return;
    default: {
      const kids = node.drawables ?? [];
      for (const kid of kids as readonly AnyDraw[]) collect(kid, out);
      return;
    }
  }
}
