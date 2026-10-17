// Purpose: the 200-field form benchmark app (tambor-exf) — B3 of the
//   bench core suite: 200 labeled single-line fields whose whole view
//   re-derives per interaction — deliberately measuring tambor's
//   likely weak spot (chat-repo cold read §4.2 B3), mounted as an
//   ordinary gallery demo through the same makeApp/SPA mount path as
//   every other corpus app.
// Responsibilities: FormState (200 field texts + the textarea scratch
//   lives in ::extra), form200State (empty texts), the per-field paths
//   (fieldTextPath(i) / fieldExtraPath(i)), form200View (200 labeled
//   textareas in a vertical layout) and createForm200App.
// Rationale: no benchmark-specific fast paths: each field is the
//   standard textarea component (src/components/textarea) with its own
//   textPath/extraPath, the focus context flows through like the todo
//   demo's textarea, and clicking a field routes the ordinary
//   request-focus/edit intents — so the measured cost is the real
//   per-interaction view re-derive over 200 fields, labelled honestly
//   (grade T, real browser, production bundle).

import {
  label as labelNode,
  spacer,
  translate,
  bounds,
  type Elem,
} from "../../views/model.ts";
import { verticalLayout } from "../../views/layout.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { textarea } from "../../components/textarea/textarea.ts";
import {
  initialTextareaExtra,
  type TextareaExtra,
} from "../../components/textarea/edit.ts";
import { VIEWPORT } from "../../spa/viewport.ts";

export const FIELD_COUNT = 200;

// The app state: plain data — one text per field.
export interface FormState {
  readonly fields: readonly { readonly text: string }[];
}

// Per-field paths: the text lives at fields[i].text, the textarea
// scratch under ::extra keyed by field index (the todo demo's
// ::extra/textarea shape, one slot per field).
export function fieldTextPath(i: number): Path {
  return [["keypath", "fields"], ["nth", i], ["keypath", "text"]];
}

export function fieldExtraPath(i: number): Path {
  return [
    ["keypath", "::extra"],
    ["keypath", `textarea-field-${i}`],
  ];
}

// The demo's initial state: 200 empty fields.
export function form200State(): FormState {
  const fields = Array.from({ length: FIELD_COUNT }, () => ({ text: "" }));
  return { fields };
}

// The scratch map the dispatcher maintains for the textareas.
export type FormExtra = Readonly<Record<string, TextareaExtra>>;

// One labeled field row: the label beside the textarea (the todo
// demo's top-row shape: label, then the textarea translated 10px
// right of the label's right edge).
function fieldRow(i: number, text: string, focus: unknown): Elem {
  const lab = labelNode(`field ${i}`);
  const extra = initialTextareaExtra();
  const ta = translate(
    bounds(lab)[0] + 10,
    0,
    textarea({
      text,
      textPath: fieldTextPath(i),
      extraPath: fieldExtraPath(i),
      focus,
      state: extra,
      font: null,
      indexForPosition: () => 0,
      now: 0,
    }),
  );
  return [lab, ta] as unknown as Elem;
}

// The 200-field form view: 200 labeled textareas in a vertical
// layout, focus flowing through the context.
export function form200View(state: FormState, context: { focus?: unknown } = {}): Elem {
  const focus = context.focus ?? null;
  const rows = state.fields.map((f, i) => fieldRow(i, f.text, focus));
  return (verticalLayout(rows) ?? (rows[0] as Elem)) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount — the same
// wire the gallery's demos use, no benchmark-specific path.
export function createForm200App(): App {
  return makeApp({
    view: (state, context) =>
      form200View(state as FormState, context as { focus?: unknown }),
    state: form200State(),
    backend: { containerSize: VIEWPORT },
  });
}
