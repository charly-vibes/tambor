// Purpose: the curated guide registry (add-docs-site task 9) — the
//   hand-written complement to the generated reference pages: typed TS
//   data modules (D2, no new esbuild loader) conforming to one shape,
//   declared here so the content check (check.ts), the build-time tool
//   (tools/check_docs_content.mjs) and — once they exist — the nav
//   consume them through a single seam.
// Responsibilities: GuidePage — the shape every guide module conforms
//   to (identity fields, the journey group every page must declare, the
//   typed-link edge list, the prose body); guides — the exported
//   registry. Authored in task 9.4 (quickstart tutorial, how-tos,
//   explanations); the registry starts empty so the check seam lands
//   before the content the check protects.
// Rationale: D2 — guides are hand-written alongside the generated
//   pages, typed with no new loader; guide→reference links are typed
//   page ids resolved against the registry ∪ the other guide ids, and
//   external http(s) URLs ride the link list into the CI-verified
//   inventory (D8), so no new link syntax or runtime parser appears.

// The narrative quadrant a guide page belongs to (D7): a quickstart is
// a tutorial (one path to a working result, < 15 min), task-focused
// pages are how-tos (one named task to a verifiable outcome), concept
// pages are explanations (prerequisites stated upfront). The substance
// check (checkGuideSubstance, check.ts) enforces each kind's evidence;
// the fields were introduced optional in task 9.3 so the check seam
// could land before the registry shipped its six pages (task 9.4).
export type GuideKind = "tutorial" | "how-to" | "explanation";

export interface GuidePage {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly description: string;
  // The journey group the shell nav renders the page under (D7);
  // a guide declaring none fails the content check (checkGroups).
  readonly group: string;
  // The typed-link edge list: page ids (generated or guide) plus any
  // external http(s) URLs — the content check resolves the ids and
  // extracts the URLs deterministically (D8), so prose can never rot
  // a link the check does not see.
  readonly links: readonly string[];
  readonly content: string;
  // ── narrative-quadrant evidence (task 9.3/9.4) ────────────────────
  // kind: which Diátaxis quadrant this page is; the substance check
  //   requires every page to declare one.
  readonly kind?: GuideKind;
  // Tutorial evidence: minutes to complete (a positive integer, at
  // most 15 — the quickstart bar) and the ids of the compiled sample
  // modules under src/docs/samples/ the prose builds on (each id is a
  // filename stem: the sample lives at src/docs/samples/<id>.ts).
  readonly durationMinutes?: number;
  readonly snippets?: readonly string[];
  // How-to evidence: the one named task and its verifiable outcome.
  readonly task?: string;
  readonly outcome?: string;
  // Explanation evidence: the prerequisites stated before concepts.
  readonly prerequisites?: readonly string[];
}

// ── the starter registry (task 9.4) ───────────────────────────────────
// Six pages covering every Diátaxis quadrant of D7: one quickstart
// tutorial (getting-started), three task-focused how-tos and two
// concept explanations (guides). Every typed link resolves against
// the generated registry ∪ these guide ids; no external URLs ride the
// link list (the CI inventory stays empty until a page names one).

const QUICKSTART_GROUP = "getting-started";
const GUIDES_GROUP = "guides";

// The quickstart: one path to a working todo result, completable in
// well under fifteen minutes, building on the compiled sample modules
// under src/docs/samples (the todo-app module the prose composes).
export const guides: readonly GuidePage[] = [
  {
    id: "quickstart",
    title: "Quickstart: a working todo app",
    statement:
      "Build a running todo app with tambor in under fifteen minutes — initial state, the app view, and the add-todo effect.",
    description:
      "One continuous path to a working result: every snippet is a real compiled module under src/docs/samples, type-checked by the build.",
    group: QUICKSTART_GROUP,
    links: [
      "example.todo",
      "tambor",
      "how-to-compose-form",
      "how-to-drag-scroll",
    ],
    content:
      "# Quickstart: a working todo app\n\nYou will build the example.todo app from its real exports — no toy stubs — and end with a renderable view you can hand to a canvas, DOM or text-terminal backend.\n\n## 1. Start from the initial state\n\nThe corpus example.todo ships its data as a plain function: todoState() returns the three seeded todos (first, second, third) with the new-todo text empty and the unfiltered filter selected.\n\n## 2. Render the app view\n\nPass that state to todoApp(state). The view is a plain value — a tree of layout, textarea, checkbox and button nodes — so rendering never touches a side effect: the same definition runs on the canvas, DOM and text backends unchanged.\n\n## 3. Apply an effect against the state\n\nAdd a todo the way the app does: the add-todo effect appends an item with your description to the end of the underlying list, even while a filter is showing only some items. Effects are data, applied by the default handler.\n\n## 4. Put it together\n\nThe sample module src/docs/samples/todo-app.ts exports run(), the documented entry — one working todo app from a fresh state. Open it, read the five-line body, then change the seeded description and re-run: the arc is state, view, effect, and it is the whole framework.\n\nTotal time: about ten minutes. When you want the navigation and scroll polish, the drag-scroll how-to continues from here.",
    kind: "tutorial",
    durationMinutes: 10,
    snippets: ["todo-app"],
  },
  {
    id: "how-to-compose-form",
    title: "How to compose a form that submits",
    statement:
      "Compose a one-named-task form: a text entry beside a submit button whose pointer-down returns the submit effect.",
    description:
      "The todo app's Add Todo row is the minimal form: a textarea bound to a state path by a derived path, and a button whose handler returns add-todo plus a set-to-empty effect.",
    group: GUIDES_GROUP,
    task: "compose a form that submits",
    outcome:
      "typing a description and pressing the button appends exactly one item with that text to the underlying list and clears the entry",
    links: ["example.todo", "component.model", "state.paths"],
    kind: "how-to",
    content:
      "# How to compose a form that submits\n\nThe task: compose a form that submits — one named task, one verifiable outcome.\n\n## Shape of a form\n\nA form is two coordinated components: an input that edits a state path (component.model gives every prop a path), and a button whose pointer-down handler returns the submitted value as an effect vector.\n\n## Bind the input\n\nBind the text entry to the state location it edits — in the todo app that is next-todo-text at NEXT_TEXT_PATH — through the derived path mechanism, so typing writes exactly that location and nothing else.\n\n## Return the submit effect\n\nThe submit button returns two effects in one batch: add-todo with the todos path and the current entry text, then set next-todo-text to the empty string. Effects are plain data, applied in order, one repaint.\n\n## Verify the outcome\n\nIn the running app the verification is direct: type fourth, press Add Todo, and the list gains exactly one item reading fourth with its checkbox open, while the entry reads empty again. The same outcome holds under any filter because every visible path reaches the original list (state.paths).",
  },
  {
    id: "how-to-drag-scroll",
    title: "How to wire drag-scrolling",
    statement:
      "Wire drag-scrolling so content larger than the viewport pans by wheel, touch and scrollbar drag without layout jumps.",
    description:
      "Scroll offsets live in the ephemeral interaction lane, never the persistent state, so 60 Hz pointer streams never enter history and never re-key the view cache.",
    group: GUIDES_GROUP,
    task: "wire drag-scrolling",
    outcome:
      "content pans via wheel, touch and scrollbar drag, with offsets clamped to the scrollable range and no layout jumps",
    links: ["app.toplevel", "components.scrollview", "interaction.lane"],
    kind: "how-to",
    content:
      "# How to wire drag-scrolling\n\nThe task: wire drag-scrolling — one named task, one verifiable outcome.\n\n## Place the scrollview\n\nWrap the content you want to pan in the scrollview component: it clips to the viewport and translates its body by the current scroll offset, keeping offsets within the scrollable range. The same component answers wheel, touch and scrollbar-drag input.\n\n## Keep offsets in the lane\n\nThe offsets themselves live in the app's ephemeral interaction lane (interaction.lane) — the per-app store outside the persistent state. Drag deltas update the lane, never the state tree, so a pointer stream at 60 Hz never enters undo history and never changes the state identity the route-time view cache keys on.\n\n## Route from the top level\n\nThe app toplevel manages the drag gestures and clears focus on a click that hits nothing, so wiring drag-scrolling is: place the scrollview, give it lane-backed offset paths, and let the toplevel route the gestures.\n\n## Verify the outcome\n\nIn the running app: content larger than the viewport pans by wheel, by touch drag, and by dragging the scrollbar; releasing at any point leaves the content settled inside the scrollable range with the layout around it unshifted — that is the no-layout-jump bar.",
  },
  {
    id: "how-to-keyboard-focus",
    title: "How to move keyboard focus across components",
    statement:
      "Move keyboard focus across the select, textareas and buttons of a screen so Tab advances focus and Enter behaves per component.",
    description:
      "Focus flows through the render context: focused textareas translate key, pointer and clipboard events into editing effects, and the event router hit-tests input to the matching descendant.",
    group: GUIDES_GROUP,
    task: "move keyboard focus across components",
    outcome:
      "Tab advances focus through every focusable component in a stable order while each keeps its own Enter behavior",
    links: [
      "event.model",
      "components.select",
      "components.textarea",
      "ui.mobile",
    ],
    kind: "how-to",
    content:
      "# How to move keyboard focus across components\n\nThe task: move keyboard focus across components — one named task, one verifiable outcome.\n\n## Focus is passed, not global\n\nEach component receives focus through the render context. A focused textarea translates key, pointer and clipboard events into effects that edit its text, cursor and selection; the select opens and closes on keyboard interaction; the focusable button fires on Enter or Space.\n\n## The tab order\n\nBecause every focusable component declares its own hit area (event.model) and the textarea components keep a cursor, the traversal order is the visual, layout order of the screen: entry, select, textarea, submit.\n\n## Component-specific Enter\n\nEnter is not global: inside the new-todo textarea it submits the form (the quickstart's enter middleware replaces the insert-newline intent), inside the description textarea it inserts a newline, and on the select it confirms the choice. Focus moves; behavior stays per component.\n\n## Verify the outcome\n\nIn the running app, Tab lands on each control in a stable order, the focused control is visibly the active one, and Enter performs that control's own action — submit in the entry, newline in a body field. On a touch device the hit areas enlarge to at least 44 by 44 (ui.mobile) while the drawn size stays unchanged.",
  },
  {
    id: "explanation-core-model",
    title: "Explanation: tambor's core model",
    statement:
      "What the core model is: UI as a pure function of state — views are plain values, handlers return effects, components edit parent state only through derived paths.",
    description:
      "The mental model behind every tambor page: one render function from state to view, one dispatch rule from event to state change, and one reason the type system can check all of it.",
    group: GUIDES_GROUP,
    prerequisites: [
      "strict TypeScript",
      "a working knowledge of the todo app from the quickstart",
    ],
    links: ["tambor", "component.model", "typing.model", "path.derivation"],
    kind: "explanation",
    content:
      "# Explanation: tambor's core model\n\nPrerequisites: strict TypeScript, and the quickstart todo app fresh in mind. This page defines the concepts before using them.\n\n## Views are plain values\n\nA view is a plain, immutable node tree — layout combinators, labels, textareas, buttons — with computable origin and bounds. Rendering is a pure function of state, so the same definition runs on the canvas, DOM and text backends unchanged.\n\n## Handlers return effects\n\nEvents never mutate state directly. A handler is a pure function that returns effects — plain data vectors the dispatcher applies in order, then triggers exactly one repaint. You can read a handler's behavior off its return value.\n\n## Components edit through derived paths\n\nA component never holds a pointer into parent state. It binds names through destructuring and iteration (component.model), and the path deriver gives every name a path that selects and updates that exact location (path.derivation) — so a row under a filter still edits the matching original element.\n\n## Why this is checkable\n\nEvery combination in that sentence — view value, effect data, derived path — is a compile-time type (typing.model). Tambor's strict surface is what makes invalid combinations fail to compile instead of failing at runtime.",
  },
  {
    id: "explanation-when-not-to-use",
    title: "Explanation: when not to use tambor",
    statement:
      "Where the model stops paying: DOM-focused features, imperative heavyweight needs, and consumers that want plain host data with no wrapper.",
    description:
      "An honest boundary: the view-as-data model earns its keep for state-driven, cross-backend UIs, and costs more than it returns for the cases here.",
    group: GUIDES_GROUP,
    prerequisites: [
      "a working knowledge of tambor's view and effect model (the core-model explanation)",
    ],
    links: ["tambor", "interop.model", "distribution.packaging"],
    kind: "explanation",
    content:
      "# Explanation: when not to use tambor\n\nPrerequisites: the core-model explanation. This page states the cases the view-as-data model does not serve well, so choosing tambor is a decision, not a default.\n\n## DOM-glued features\n\nView and effect semantics live in tambor's own node model and dispatcher. If your screen is mostly browser-natural behavior — arbitrary imperative effects on every paint, vendor widgets with their own event plumbing — you are paying the translation layer's tax for no cross-backend gain.\n\n## When state is not the story\n\nTambor is built around a pure state function. A UI whose behavior is dominated by imperative, external state — sockets, editor keystroke streams owned elsewhere — fights the model; the parts that do not derive from state become awkward effects.\n\n## Hosts that want plain data\n\nThe library accepts and returns host data directly, so a squint or ClojureScript program needs no wrapper beyond an optional five-function data-ops object (interop.model) — but if your consumer is a non-TypeScript host that wants nothing but JS values, the typed surface (typing.model under the hood) still rides the package. Evaluate against the packaged artifact before committing.\n\n## The decision\n\nUse tambor when the UI is a pure function of application state, needs to run on more than one backend, and benefits from compile-time-checked views, paths and effects. For anything dominated by the cases above, a platform-native approach solves it in less code.",
  },
];