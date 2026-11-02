// Purpose: executable contract tests for the ui-mobile delta
//   "Bridge navigation keys and modifiers" — the soft-keyboard bridge's
//   key table, its modifier carry and its case preservation.
// Responsibilities: encode each scenario of the delta requirement as a
//   vitest test: Home, End and Delete become named key-press events,
//   the modifier flags of a hardware key-down ride along on the
//   key-press event, and neither a named key nor composed text loses
//   its case.
// Rationale: openspec/changes/add-textarea-editing-model/specs/ui-mobile/spec.md
//   is the design authority for this change's ui-mobile delta; the
//   deployed baseline (openspec/specs/ui-mobile/spec.md
//   soft_keyboard_bridge) stays as it is until the change is archived.

import { expect, it } from "vitest";

import { bridgeEvents } from "../src/ui/keyboard.ts";

// The three scenarios of the delta requirement.

// Scenario: Home and End are named
it("p_bridge_named: Home, End and Delete become named key-press events", () => {
  expect(bridgeEvents({ kind: "keydown", key: "Home" })).toEqual([
    { type: "key-press", key: "home" },
  ]);
  expect(bridgeEvents({ kind: "keydown", key: "End" })).toEqual([
    { type: "key-press", key: "end" },
  ]);
});

// Scenario: modifiers are carried
it("p_bridge_modifiers: the modifier flags of a key-down ride along on the key-press event", () => {
  expect(bridgeEvents({ kind: "keydown", key: "a", mods: ["shift", "ctrl"] })).toEqual([
    { type: "key-press", key: "a", mods: ["shift", "ctrl"] },
  ]);
  // every modifier flag the hardware reports is carried, none is dropped
  expect(bridgeEvents({ kind: "keydown", key: "a", mods: ["shift", "ctrl", "meta", "alt"] })).toEqual([
    { type: "key-press", key: "a", mods: ["shift", "ctrl", "meta", "alt"] },
  ]);
  // a key-down without modifiers produces the plain key-press
  expect(bridgeEvents({ kind: "keydown", key: "a" })).toEqual([
    { type: "key-press", key: "a" },
  ]);
});

// Scenario: composed text keeps casing
it("p_bridge_case: composed text keeps its case and a named key is not lowercased", () => {
  expect(bridgeEvents({ kind: "composition-end", data: "Éa" })).toEqual([
    { type: "key-press", key: "Éa" },
  ]);
  expect(bridgeEvents({ kind: "input", data: "Éa" })).toEqual([
    { type: "key-press", key: "Éa" },
  ]);
  // a named key is mapped, never case-folded: the DOM name is a name,
  // not text
  expect(bridgeEvents({ kind: "keydown", key: "Delete" })).toEqual([
    { type: "key-press", key: "delete" },
  ]);
  // a printable key-down keeps the case the hardware reported
  expect(bridgeEvents({ kind: "keydown", key: "A" })).toEqual([
    { type: "key-press", key: "A" },
  ]);
});
