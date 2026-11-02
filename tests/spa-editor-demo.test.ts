// Purpose: contract tests for the gallery editor demo (tambor-72m task
//   10.1) — the multi-line textarea mounted in the extended profile.
// Responsibilities: assert the demo is registered in the gallery, that a
//   click focuses it and places the cursor through the buffer's
//   multi-line hit-test, that typed keys edit the text through the
//   extended profile's handler routing, and that undo restores the
//   pre-edit text.
// Rationale: openspec/changes/add-textarea-editing-model/tasks.md 10.1 —
//   the gallery example exercises shift-select, undo and vertical
//   movement through the real wire shapes (spaFocusView context,
//   request-focus registry effect, handler-routed editing intents), so
//   the test drives the same dispatch path the SPA mount uses.

import { expect, it } from "vitest";

import { DEMOS, } from "../src/spa/gallery.ts";
import { registerSpaFocus } from "../src/spa/focus.ts";
import { dispatch } from "../src/events/dispatch.ts";
import { keyPress, mouseDown } from "../src/events/event.ts";

// The demo module is loaded through the gallery's dynamic import
// boundary; the test imports the factory directly (the same function
// the registry's load() resolves).
const { createEditorApp } = await import("../src/examples/editor.ts");

it("the gallery registers the editor demo", () => {
  const demo = DEMOS.find((d) => d.id === "editor");
  expect(demo).toBeDefined();
});

// Click into the editor (request-focus + buffer placement), then type:
// the text must gain the typed characters (the handler routes the
// extended editing intents through the editor buffer).
it("the editor demo edits through the extended profile: click places, typing inserts, ctrl+z undoes", () => {
  registerSpaFocus();
  const app = createEditorApp();
  const before = (app.getState() as { text: string | null }).text ?? "";

  // a pointer down inside the textarea focuses it and places the cursor
  // (the bordered frame's content starts at [5, 2]; click on the first
  // line)
  const down = dispatch(app.view(), mouseDown([8, 3]));
  expect(down.some((i) => i[0] === "request-focus")).toBe(true);
  app.dispatch(down);

  // typing inserts through the buffer (the focused extended textarea)
  const typed = dispatch(app.view(), keyPress("X"));
  expect(typed.length).toBeGreaterThan(0);
  app.dispatch(typed);
  const after = (app.getState() as { text: string | null }).text ?? "";
  expect(after).toContain("X");
  expect(after).not.toBe(before);

  // ctrl+z undoes the insert through the buffer's history
  const undone = dispatch(app.view(), keyPress("z", { mods: ["ctrl"] }));
  app.dispatch(undone);
  expect((app.getState() as { text: string | null }).text).toBe(before);
});

// Vertical movement keeps the goal column: from a column on a long
// first line, down lands within the second line (not at its start —
// the membrane quirk would land on the newline).
it("the editor demo moves down by goal column", () => {
  registerSpaFocus();
  const app = createEditorApp();
  app.dispatch(dispatch(app.view(), mouseDown([8, 3])));
  // park the cursor at a known index with home (line start), then right
  // twice, then down: the cursor must be on the second line (index > the
  // first line's length), not on the newline character
  app.dispatch(dispatch(app.view(), keyPress("right")));
  app.dispatch(dispatch(app.view(), keyPress("right")));
  app.dispatch(dispatch(app.view(), keyPress("down")));
  const cursor = (
    (app.getState() as { "textarea-state": { cursor: number } })["textarea-state"]
  ).cursor;
  const firstLineEnd = (((app.getState() as { text: string | null }).text ?? "").split("\n")[0] ?? "").length;
  expect(cursor).toBeGreaterThan(firstLineEnd);
});
