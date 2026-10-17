// Purpose: contract tests for the save-restore-5k bench app (tambor-di0)
//   — save/restore must be plain serialise/parse over plain data and
//   must work through the ordinary update-intent wire before the
//   browser scenario can be trusted to measure anything.
// Responsibilities: pin (a) build5k produces 5k distinct plain items,
//   (b) serialise emits one JSON string whose restore round-trips the
//   items and the checksum (and a tampered save is a no-op, never a
//   partial restore), (c) the ordinary ["update", …] intents through
//   the app's dispatcher save and restore with checksum equality and
//   sane per-op timing (each well under the 60fps op budget).
// Rationale: the keyed-table finding generalizes — a bench app whose
//   measured op is a no-op produces overhead-only medians; the checksum
//   makes "the round-trip actually happened" a checked contract instead
//   of a screenshot eyeball.

import { describe, it, expect } from "vitest";
import {
  build5k,
  checksumOf,
  createSaveRestore5kApp,
  ITEM_COUNT,
  ITEMS_PATH,
  RESTORE_PATH,
  SAVE_PATH,
  saveOp,
  restoreOp,
  serialise,
  statusLine,
  type SaveRestoreState,
} from "../src/examples/bench/save-restore-5k.ts";

describe("save-restore-5k bench app", () => {
  it("builds 5k distinct plain-data items", () => {
    const items = build5k();
    expect(items.length).toBe(ITEM_COUNT);
    expect(new Set(items.map((i) => i.id)).size).toBe(ITEM_COUNT);
    expect(items[0]).toEqual({ id: 0, label: "item 0", weight: 1 });
  });

  it("save serialises the whole state to one plain string", () => {
    const saved = serialise(build5k());
    expect(typeof saved).toBe("string");
    expect(saved.startsWith("{\"checksum\":")).toBe(true);
    const snap = JSON.parse(saved) as { items: unknown[] };
    expect(snap.items.length).toBe(ITEM_COUNT);
  });

  it("restore round-trips the items and the checksum", () => {
    const items = build5k();
    const restored = restoreOp(serialise(items), []);
    expect(restored.length).toBe(ITEM_COUNT);
    expect(checksumOf(restored)).toBe(checksumOf(items));
    expect(restored[4999]).toEqual({ id: 4999, label: "item 4999", weight: 53 });
  });

  it("a tampered save restores nothing (no partial restore)", () => {
    const items = build5k();
    const saved = serialise(items);
    const tampered = saved.replace(`"weight":2`, `"weight":99`);
    expect(tampered).not.toBe(saved);
    expect(restoreOp(tampered, items)).toBe(items);
  });

  it("the ordinary update intents through the app save and restore in time", () => {
    const app = createSaveRestore5kApp();
    app.dispatch(["update", ITEMS_PATH, () => build5k()]);

    const t0 = Date.now();
    app.dispatch(["update", SAVE_PATH, saveOp]);
    const saveMs = Date.now() - t0;
    const saved = (app.getState() as SaveRestoreState).saved;
    expect(saved.length).toBeGreaterThan(1000);

    const t1 = Date.now();
    app.dispatch(["update", RESTORE_PATH, restoreOp]);
    const restoreMs = Date.now() - t1;

    const state = app.getState() as SaveRestoreState;
    expect(state.items.length).toBe(ITEM_COUNT);
    expect(checksumOf(state.items)).toBe(checksumOf(build5k()));
    // timing sanity: serialise/parse of 5k plain items is milliseconds,
    // nowhere near a frame budget — a regression here fails loudly.
    expect(saveMs).toBeLessThan(250);
    expect(restoreMs).toBeLessThan(250);
    expect(statusLine(state)).toContain("saved");
  });
});
