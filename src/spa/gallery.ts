// Purpose: the gallery SPA (tambor-cie.2) — one interactive demo per
//   corpus-documented component/example, mounted through the same
//   DomBackend + event-router wire as the todo SPA.
// Responsibilities: DEMOS — the ordered demo registry (id, title, blurb,
//   create() app factory); each demo is a pure view over plain state
//   mounted via mountDemo (mount.ts). The first three exemplars:
//   example-todo (todo clicks/filters), components.numeric (counter
//   dec/inc effects), components.select (dropdown header toggle +
//   select-closes interception).
// Rationale: openspec/specs/<name>/spec.md files are the design
//   authorities — demos change no semantics; they exercise the corpus
//   components through the real-DOM host so a visitor can feel the
//   pure-data model. Demo views are pure functions of state; intents
//   route through dispatch → makeApp's registry-aware dispatcher.

import { render, call } from "../model/component.ts";
import { counter } from "../components/numeric/counter.ts";
import { dropdown } from "../components/select/dropdown.ts";
import { makeApp, type App } from "../effects/dispatch.ts";
import type { Path } from "../effects/paths.ts";
import { todoApp, todoState, type TodoState } from "../examples/todo/todo.ts";
import { createLogoApp } from "../examples/logo/logo.ts";
import { createKeyedTableApp } from "../examples/bench/keyed-table.ts";
import { createTurtle20kApp } from "../examples/bench/turtle-20k.ts";
import { createTodoBenchApp } from "../examples/bench/todomvc.ts";
import { createForm200App } from "../examples/bench/form-200.ts";
import { createTimeTravel10kApp } from "../examples/bench/time-travel-10k.ts";
import { createSaveRestore5kApp } from "../examples/bench/save-restore-5k.ts";
import { createDashboardDerivedApp } from "../examples/bench/dashboard-derived.ts";
import { createReviewFaultsApp } from "../examples/bench/review-faults.ts";
import { createStreamDashboardApp } from "../examples/bench/stream-dashboard.ts";
import type { Elem } from "../views/model.ts";
import { VIEWPORT } from "./viewport.ts";

export interface DemoDef {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  create(): App;
}

// --- example-todo ----------------------------------------------------------

function createTodoDemo(): App {
  return makeApp({
    view: (state, context) =>
      todoApp(state as TodoState, context as { focus?: unknown }),
    state: todoState(),
    backend: { containerSize: VIEWPORT },
  });
}

// --- components.numeric (counter) ------------------------------------------

const NUM_PATH: Path = [["keypath", "num"]];

interface CounterState {
  readonly num: number;
}

// The counter call rendered against the app state: num is read from
// the state each render, $num addresses it (counter_buttons routes
// dec/inc intents at that path).
function counterView(state: unknown): Elem {
  const s = state as CounterState;
  return render(call(counter, { num: s.num, $num: NUM_PATH })) as Elem;
}

function createCounterDemo(): App {
  return makeApp({
    view: (state) => counterView(state),
    state: { num: 5 } as CounterState,
    backend: { containerSize: VIEWPORT },
  });
}

// --- components.select (dropdown) ------------------------------------------

const SELECTED_PATH: Path = [["keypath", "selected"]];
const OPEN_PATH: Path = [["keypath", "open?"]];
const EXTRA_ROOT: Path = [["keypath", "::extra"]];

const OPTIONS: readonly (readonly [unknown, string])[] = [
  ["uno", "Uno"],
  ["dos", "Dos"],
  ["tres", "Tres"],
];

interface SelectState {
  readonly selected: unknown;
  readonly "open?": boolean;
  readonly "::extra": Record<string, unknown>;
}

// The dropdown call rendered against the app state; the scratch tree
// lives at the root ::extra entry (component.model top-level-ui
// semantics, same shape the components.select contracts use).
function dropdownView(state: unknown): Elem {
  const s = state as SelectState;
  return render(
    call(
      dropdown,
      {
        selected: s.selected,
        options: OPTIONS,
        $selected: SELECTED_PATH,
        "open?": s["open?"],
        "$open?": OPEN_PATH,
      },
      { extra: s["::extra"], $extra: EXTRA_ROOT },
    ),
  ) as Elem;
}

function createSelectDemo(): App {
  return makeApp({
    view: (state) => dropdownView(state),
    state: { selected: null, "open?": false, "::extra": {} } as SelectState,
    backend: { containerSize: VIEWPORT },
  });
}

// --- example-logo (the wanna-chat Logo world) -------------------------------

// The live-world demo: the state is plain data, the world is re-derived
// from fold(entries[0..cursor]) every render, and run/clear route
// through the demo's per-app registry (makeOpsApp), never the global
// effect registry.
function createLogoDemo(): App {
  return createLogoApp();
}

// --- registry ---------------------------------------------------------------

export const DEMOS: readonly DemoDef[] = [
  {
    id: "todo",
    title: "todo",
    blurb:
      "example.todo — add, complete, filter. Clicks route through the corpus event router.",
    create: createTodoDemo,
  },
  {
    id: "counter",
    title: "counter",
    blurb:
      "components.numeric — the - / label / + row; dec and inc are plain-data effects applied at $num.",
    create: createCounterDemo,
  },
  {
    id: "select",
    title: "dropdown",
    blurb:
      "components.select — tap the header to open, tap an option to select; select closes the list.",
    create: createSelectDemo,
  },
  {
    id: "logo",
    title: "logo",
    blurb:
      "example.logo — the world is never stored: world = fold(entries[0..cursor]). Run programs, rewind with the slider, redefine a procedure for late binding.",
    create: createLogoDemo,
  },
  {
    id: "keyed-table",
    title: "keyed-table",
    blurb:
      "bench key-table — 1000 keyed rows over plain state: Build 1000, Replace 10%, Swap Rows, Remove 10, Append 1k, each an ordinary update intent.",
    create: createKeyedTableApp,
  },
  {
    id: "turtle-20k",
    title: "turtle-20k",
    blurb:
      "bench turtle — 20k path segments derived by the corpus logo interpreter: Draw 20k + Recolor as ordinary update intents.",
    create: createTurtle20kApp,
  },
  {
    id: "todomvc",
    title: "todomvc",
    blurb:
      "bench todo — the example.todo app at scale (200 seeded todos): add, complete, delete through the ordinary effects.",
    create: createTodoBenchApp,
  },
  {
    id: "save-restore-5k",
    title: "save-restore-5k",
    blurb:
      "bench state — 5k plain-data items: Save serialises the whole state to one JSON string, Restore rehydrates it and verifies the checksum — no component-tree traversal.",
    create: createSaveRestore5kApp,
  },
  {
    id: "form-200",
    title: "form-200",
    blurb:
      "bench form — 200 labeled fields over plain state: every interaction re-derives the whole view (the honest weak-spot measurement).",
    create: createForm200App,
  },
  {
    id: "time-travel-10k",
    title: "time-travel-10k",
    blurb:
      "bench time travel — a 10k-step log over plain state: Build 10k, Scrub to 5k/10k and Undo one move the cursor as ordinary update intents (the log is never rewritten).",
    create: createTimeTravel10kApp,
  },
  {
    id: "dashboard-derived",
    title: "dashboard-derived",
    blurb:
      "bench dashboard — ~20 derived tiles over one 500-number series: Seed, Bump and Bump 100 are ordinary update intents, and every bump re-derives every tile (no memo, no computed — the honest cost of many derived values).",
    create: createDashboardDerivedApp,
  },
  {
    id: "review-faults",
    title: "review-faults",
    blurb:
      "bench faults — a 200-item review session (draft → submitted → acked/rejected): duplicate, stale and lost acks are injected as ordinary update intents; echoed ids and typed outcomes keep the queue consistent.",
    create: createReviewFaultsApp,
  },
  {
    id: "stream-dashboard",
    title: "stream-dashboard",
    blurb:
      "bench stream — 500 tickers with sparklines and a top-of-book line fed by a simulated quote stream: Stream naive dispatches one intent per message (a full re-derive each), Stream frame folds the whole 80-message burst into one update — same final state, one repaint.",
    create: createStreamDashboardApp,
  },
];
