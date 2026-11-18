// Purpose: the BZ6 environment bench app (tambor-54j.18) — a
//   Smalltalk-like environment over 100k logical objects with an
//   inspector window of folded entry lines, mounted as an ordinary
//   gallery demo through the same makeApp/SPA mount path as every
//   other corpus app.
// Responsibilities: EnvState + ENV_PATH, environmentState (empty —
//   seeding is the untimed setup op), the five op intents (seed /
//   editNaive / editFold / rewindReplay / rewindCkpt — shapes in
//   environment-model.ts), environmentView (two stacked control rows,
//   the fitted status guard line, the 24-entry folded inspector
//   window whose every entry line is itself wrapped by fittedLabels)
//   and createEnvironmentApp.
// Rationale: every op is an ordinary ["update", …] intent applied by
// the registry-aware dispatcher — no benchmark-specific path. The
// drawn window re-derives from plain state each dispatch (the corpus
// pure-view rule); the fold STRATEGY is the only variable between the
// paired ops, and the status line's counters + window checksum are
// the no-op guards (a misroute or a diverging strategy fails
// loudly). The 100k objects are logical: the sparse Map holds only
// the materialised table and the view draws only the 24-entry window.
// Entry text is state-derived and can run past the stage after seeding
// or editing, so each row wraps through fittedLabels and occupies as
// many lines as its measured text needs — content is never clamped.

import {
  button,
  spacer,
  type Elem,
} from "../../views/model.ts";
import { horizontalLayout, verticalLayout } from "../../views/layout.ts";
import type { IntentList } from "../../events/bubble.ts";
import type { Path } from "../../effects/paths.ts";
import { makeApp, type App } from "../../effects/dispatch.ts";
import { VIEWPORT } from "../../spa/viewport.ts";
import {
  WIN_ROWS,
  editFold,
  editNaive,
  emptyEnvironment,
  entryLine,
  rewindCkpt,
  rewindReplay,
  seedEnvironment,
  statusLine,
  type EnvState,
} from "./environment-model.ts";
import { fittedLabels } from "../../views/fit.ts";

// The app state: one plain-data environment node — a single keypath
// keeps each op's edit + fold + counters in one atomic update.
export interface EnvironmentAppState {
  readonly env: EnvState;
}

export const ENV_PATH: Path = [["keypath", "env"]];

// The demo's initial state: an empty environment — seeding it is the
// untimed setup op.
export function environmentState(): EnvironmentAppState {
  return { env: emptyEnvironment() };
}

// The five ops as ordinary update intents over the one env path.
const SEED_INTENT: IntentList = [["update", ENV_PATH, seedEnvironment]];
const EDIT_NAIVE_INTENT: IntentList = [["update", ENV_PATH, editNaive]];
const EDIT_FOLD_INTENT: IntentList = [["update", ENV_PATH, editFold]];
const REWIND_REPLAY_INTENT: IntentList = [["update", ENV_PATH, rewindReplay]];
const REWIND_CKPT_INTENT: IntentList = [["update", ENV_PATH, rewindCkpt]];

// The visible window: one folded inspector entry per row, drawn from
// the state's cache-then-table lookup (a pure view over plain data).
// Each entry line is wrapped by fittedLabels so a long state dump
// stays inside the stage width by taking several stacked lines.
function inspectorWindow(state: EnvState): readonly Elem[] {
  const rows: Elem[] = [];
  for (let id = 0; id < WIN_ROWS; id++) {
    rows.push(...fittedLabels(entryLine(state, id)));
  }
  return rows;
}

// The environment view: two stacked control rows (one row of five
// measures 519 px after the 44 px button floor) split three then two,
// the status guard line wrapped to the stage width by fittedLabels,
// then the folded inspector window. Pure view — every counter and
// window line re-derives from plain state each dispatch.
export function environmentView(state: EnvironmentAppState): Elem {
  const controls = verticalLayout(
    [
      horizontalLayout([
        button("Seed 100k", (): IntentList => SEED_INTENT),
        spacer(5, 0),
        button("Edit naive", (): IntentList => EDIT_NAIVE_INTENT),
        spacer(5, 0),
        button("Edit fold", (): IntentList => EDIT_FOLD_INTENT),
      ]) as Elem,
      horizontalLayout([
        button("Rewind replay", (): IntentList => REWIND_REPLAY_INTENT),
        spacer(5, 0),
        button("Rewind ckpt", (): IntentList => REWIND_CKPT_INTENT),
      ]) as Elem,
    ],
    6,
  ) as Elem;
  const body = [
    controls,
    ...fittedLabels(statusLine(state.env)),
    spacer(0, 10),
    ...inspectorWindow(state.env),
  ] as readonly Elem[];
  return (verticalLayout(body) ?? controls) as Elem;
}

// The bench app: the ordinary registry-aware makeApp mount, the same
// shape gallery.ts's demos use — no benchmark-specific path.
export function createEnvironmentApp(): App {
  return makeApp({
    view: (state) => environmentView(state as EnvironmentAppState),
    state: environmentState(),
    backend: { containerSize: VIEWPORT },
  });
}
