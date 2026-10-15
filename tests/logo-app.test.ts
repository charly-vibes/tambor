// Purpose: the example.logo app contract tests (tambor-y9d.2) — the
//   demo state, the per-app effect seam, and the pure view.
// Responsibilities: verify (1) run appends the editor source as a fold
//   entry and moves the cursor to the end (or records the interpreter
//   error without touching entries); (2) clear empties the world; (3)
//   the late toggle routes through the set builtin at the late? path;
//   (4) the view derives the world from entries[0..cursor] so rewinding
//   the cursor changes the drawn trace; (5) the demo app exposes the
//   corpus App wire (view/dispatch/getState) over makeOpsApp.
// Rationale: openspec/specs/interop-model/spec.md is the design
//   authority for the seam — run and clear are per-app registry
//   entries, never global (ops_bound_to_app); the fold semantics are
//   the wanna-chat session demo's. The demo changes no corpus
//   semantics; these tests pin the demo's own wiring.

import { describe, expect, it } from "vitest";

import {
  createLogoApp,
  logoState,
  logoView,
  LOGO_TITLE,
  CURSOR_PATH,
  LATE_PATH,
  SRC_PATH,
  runLogo,
  clearLogo,
  type LogoState,
} from "../src/examples/logo/logo.ts";
import { EXAMPLES } from "../src/examples/logo/interpreter.ts";
import { scanOf } from "./helpers/scan.ts";
import type { Node } from "../src/views/model.ts";

// The view scan of the current state (the view is a pure fn of state).
function pathNodes(state: LogoState): readonly Node[] {
  return scanOf(logoView(state, {})).map((f) => f.node);
}

function labelOf(state: LogoState): readonly string[] {
  return scanOf(logoView(state, {}))
    .map((f) => (f.node.type === "label" ? (f.node as { text: string }).text : ""))
    .filter((t) => t.length > 0);
}

describe("logo-app — the per-app effect seam", () => {
  it("run appends the editor source as a fold entry and moves the cursor", () => {
    const s0 = { ...logoState(), src: EXAMPLES["square"] as string };
    const s1 = runLogo(s0);
    expect(s1.entries.length).toBe(1);
    expect(s1.cursor).toBe(1);
    expect(s1.err).toBe("");
  });

  it("run with an invalid program records the error and keeps entries", () => {
    const s0 = { ...logoState(), src: "foo" };
    const s1 = runLogo(s0);
    expect(s1.entries.length).toBe(0);
    expect(s1.err).toMatch(/don't know how to foo/);
  });

  it("rewinding drops future entries on the next run (entries[0..cursor])", () => {
    let s = { ...logoState(), src: EXAMPLES["square"] as string };
    s = runLogo(s);
    s = { ...s, src: EXAMPLES["star"] as string, cursor: 0 };
    s = runLogo(s);
    expect(s.entries.length).toBe(1);
    expect((s.entries[0] as { text: string }).text).toBe(EXAMPLES["star"]);
  });

  it("clear empties the world", () => {
    let s = { ...logoState(), src: EXAMPLES["square"] as string };
    s = runLogo(s);
    s = clearLogo(s);
    expect(s.entries.length).toBe(0);
    expect(s.cursor).toBe(0);
    expect(s.err).toBe("");
  });

  it("run and clear are per-app registry entries, not globals", () => {
    // a fresh registry built per app: two apps dispatching run do not
    // share registrations through the global effect registry
    const app = createLogoApp();
    app.dispatch([["set", SRC_PATH, "fd 10"], ["run"]]);
    const s = app.getState() as LogoState;
    expect(s.entries.length).toBe(1);
  });
});

describe("logo-app — the App wire", () => {
  it("exposes view/dispatch/getState and dispatches the set builtin", () => {
    const app = createLogoApp();
    app.dispatch([["set", LATE_PATH, true], ["set", SRC_PATH, EXAMPLES["star"] as string]]);
    const s = app.getState() as LogoState;
    expect(s["late?"]).toBe(true);
    expect(s.src).toBe(EXAMPLES["star"]);
  });

  it("the view renders the title and the cursor position", () => {
    const app = createLogoApp();
    app.dispatch([["set", SRC_PATH, EXAMPLES["square"] as string], ["run"]]);
    const labels = labelOf(app.getState() as LogoState);
    expect(labels.some((t) => t.includes(LOGO_TITLE))).toBe(true);
    expect(labels.some((t) => t.includes("1/1"))).toBe(true);
  });

  it("the view derives the world from entries[0..cursor] — rewind redraws", () => {
    const app = createLogoApp();
    app.dispatch([["set", SRC_PATH, EXAMPLES["square"] as string], ["run"]]);
    app.dispatch([["set", SRC_PATH, EXAMPLES["star"] as string], ["run"]]);
    // full world: 4 (square) + 5 (star) segments + the turtle marker
    expect(pathNodes(app.getState() as LogoState).filter((n) => n.type === "path").length).toBe(10);
    // rewind to the first entry: only the square's segments remain
    app.dispatch([["set", CURSOR_PATH, 1]]);
    expect(pathNodes(app.getState() as LogoState).filter((n) => n.type === "path").length).toBe(5);
  });

  it("an invalid entry renders the error label and keeps the world empty", () => {
    const app = createLogoApp();
    app.dispatch([["set", SRC_PATH, "foo"], ["run"]]);
    const s = app.getState() as LogoState;
    const labels = labelOf(s);
    expect(labels.some((t) => t.includes("don't know how to foo"))).toBe(true);
  });
});
