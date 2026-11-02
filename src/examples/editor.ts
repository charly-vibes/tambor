// Purpose: the gallery editor demo (tambor-72m task 10.1) — a
//   multi-line markdown textarea mounted in the extended editing
//   profile: grapheme-aware cursor, shift-select, ctrl+z undo,
//   goal-column vertical movement and click placement on lower lines.
// Responsibilities: createEditorApp — the makeApp wire over a seeded
//   markdown state; editorHandler routes the extended editing intents
//   through applyTextareaIntents (the buffer-backed application seam)
//   and everything else through the builtins; editorMetrics builds the
//   buffer geometry from the SAME measure the layout uses
//   (text_measure_injected — design D3's mitigation: the measure that
//   lays the text out is the one the goal-column moves and the hit-test
//   consume).
// Rationale: the demo is mounting plumbing in the notebook's shape —
//   the view is spaFocusView-wrapped so the corpus request-focus effect
//   (registered per mount by the SPA input surface) flows to the
//   textarea as context focus, and every edit rides app.dispatch so the
//   mount's draw wire stays the only path (tambor-a45).

import {
  defaultHandler,
  makeApp,
  type App,
  type EffectContext,
  type Handler,
} from "../effects/dispatch.ts";
import type { Intent } from "../events/bubble.ts";
import { applyTextareaIntents, initialTextareaExtra } from "../components/textarea/edit.ts";
import { textarea } from "../components/textarea/textarea.ts";
import { type Metrics } from "../components/textarea/buffer.ts";
import { currentLabelMeasure } from "../views/nodes.ts";
import type { Elem } from "../views/model.ts";
import type { Path } from "../effects/paths.ts";
import { VIEWPORT } from "../spa/viewport.ts";
import { spaFocusView } from "../spa/focus.ts";

// The state: text and focus in app state (text_state_split), the
// extended profile's goal x and undo history in the textarea-state
// extra map (extended_state_placement).
export interface EditorState {
  readonly text: string | null;
  readonly "textarea-state": ReturnType<typeof initialTextareaExtra>;
}

const TEXT_PATH: Path = [["keypath", "text"]];
const EXTRA_PATH: Path = [["keypath", "textarea-state"]];

// The seeded markdown: multi-line, with an accented word (a combining
// mark under NFC-free typing) and a ZWJ family emoji, so the demo shows
// cluster-aware cursor movement and deletion.
const SEED = [
  "# slide deck",
  "",
  "- café — édité",
  "- family 👨‍👩‍👧 flag 🇺🇸",
  "",
  "Click a line, then: shift+arrows select, ctrl+z undo, up and down keep the column.",
].join("\n");

// The editing intents the extended textarea emits and the handler routes
// through the buffer-backed interpreter (the clipboard effects are
// builtins, request-focus is a registry effect — neither lands here).
const EDIT_INTENTS: ReadonlySet<string> = new Set([
  "insert-text",
  "insert-newline",
  "delete-backward",
  "delete-forward",
  "backward-char",
  "forward-char",
  "previous-line",
  "next-line",
  "backward-word",
  "forward-word",
  "move-to-line-start",
  "move-to-line-end",
  "move-to-document-start",
  "move-to-document-end",
  "select-all",
  "undo",
  "redo",
]);

// The buffer geometry: the width measure is the label measure the layout
// itself uses (so x goals and click placement agree with what is drawn);
// the line pitch is the 16px line box the emitted span renders. Headless
// (no configured measure) this is the unit default, matching the tests.
function editorMetrics(): Metrics {
  const measure = currentLabelMeasure();
  return { measure: (text: string) => measure(text)[0], lineHeight: 16 };
}

// The makeApp handler: editing intents route through the extended
// interpreter, the rest through the builtins (the notebook pattern).
function editorHandler(): Handler {
  return (state, effects, ctx: EffectContext) => {
    let s: unknown = state;
    for (const effect of effects) {
      if (EDIT_INTENTS.has(effect[0] as string)) {
        s = applyTextareaIntents(s, [effect as Intent], {
          profile: "extended",
          metrics: editorMetrics(),
        }).state;
        continue;
      }
      s = defaultHandler(s, [effect], ctx);
    }
    return s;
  };
}

// The demo view: one extended-profile textarea bound to the app state;
// the focus comes from the spaFocusView context (focus_ctx).
function editorView(state: unknown, context: { focus?: unknown }): Elem {
  const s = state as EditorState;
  return textarea({
    text: s.text,
    textPath: TEXT_PATH,
    extraPath: EXTRA_PATH,
    state: s["textarea-state"],
    focus: context.focus ?? null,
    font: null,
    indexForPosition: () => 0,
    profile: "extended",
    metrics: editorMetrics(),
  }) as Elem;
}

// The gallery-mountable app (the registry's load() resolves this).
export function createEditorApp(): App {
  return makeApp({
    view: spaFocusView(editorView),
    state: { text: SEED, "textarea-state": initialTextareaExtra() } as EditorState,
    handler: editorHandler(),
    backend: { containerSize: VIEWPORT },
  });
}
