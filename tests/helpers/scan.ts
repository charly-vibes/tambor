// Purpose: shared tree scans for the mobile contract tests — finding
//   nodes of one type across the view and event layers.
// Responsibilities: findAll performs a depth-first scan for nodes of a
//   single type, reusing descendantsOf from src/ui/overflow.ts (the
//   corpus's own event-layer-aware child query) instead of
//   re-implementing the walk.
// Rationale: specs/ui-mobile.md is the design authority; tambor-272
//   redistributes the former monolithic tests/ui-mobile.test.ts into
//   topic files, and every walker here keeps cyclomatic complexity ≤ 3
//   by pushing each decision into its own small named function.

import { descendantsOf } from "../../src/ui/overflow.ts";
import type { Node } from "../../src/views/model.ts";

// A node's contribution to a type scan: itself when it matches, else
// its descendants scanned recursively.
function matchOrRecurse(node: Node, type: string): readonly Node[] {
  if (node.type === type) return [node];
  return descendantsOf(node).flatMap((child) => findAll(child, type));
}

// Depth-first scan for nodes of one type.
function findAll(elem: unknown, type: string): readonly Node[] {
  if (elem == null) return [];
  if (Array.isArray(elem)) return elem.flatMap((child) => findAll(child, type));
  return matchOrRecurse(elem as Node, type);
}

export { findAll };
