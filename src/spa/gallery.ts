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
];
