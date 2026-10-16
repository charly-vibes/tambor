// Purpose: the logo demo's inspector pane (tambor-y9d.6) — the
//   Smalltalk-style inspector that shows the selected item's fields as
//   plain data, with a ✕ handle that deselects.
// Responsibilities: inspectorPane(s, w) — null when nothing is
//   selected or the selection names nothing on screen; otherwise the
//   ✕ deselect button (emitting ["select", null]), the
//   "inspector — <item>" title row, and one "field: value" label per
//   projected field (inspectItem).
// Rationale: the inspector is a pure view over state.sel and the
//   derived world: the fields are projected by select.ts (inspectItem)
//   and the deselect routes as pure data through the demo's per-app
//   registry — no imperative mutation anywhere (tambor-y9d.6).

import { button, label as labelNode, type Elem } from "../../views/model.ts";
import { verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { LogoState } from "./logo.ts";
import type { World } from "./interpreter.ts";
import { inspectItem, itemTitle, selectEffect } from "./select.ts";

// "field: value" — plain data rendered as text (null prints as null).
function fieldLabel(k: string, v: string | number | boolean | null): Elem {
  return labelNode(`${k}: ${v === null ? "null" : String(v)}`);
}

export function inspectorPane(s: LogoState, w: World): Elem {
  if (s.sel === null) return null;
  const fields = inspectItem(w, s.sel);
  if (fields === null) return null;
  const rows: Elem[] = Object.keys(fields).map((k) =>
    fieldLabel(k, fields[k] as string | number | boolean | null),
  );
  return verticalLayout([
    button("✕", () => [selectEffect(null)] as unknown as IntentList),
    labelNode(`inspector — ${itemTitle(s.sel)}`),
    ...rows,
  ]);
}
