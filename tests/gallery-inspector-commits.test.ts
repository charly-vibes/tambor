// @vitest-environment jsdom
// Purpose: the commit-intents contract tests (add-gallery-inspector
//   §1) — the dispatched batch publishes as the commit's frozen,
//   copy-on-publish intents array.
// Responsibilities: pin that a dispatched batch publishes as the
//   commit's frozen intents array (same order, deep-equal, and
//   mutating the caller's array afterwards changes nothing), that a
//   string dispatch normalizes to a one-element intents array, and
//   that a lane-only batch still carries its lane intent.
// Rationale: openspec/changes/add-gallery-inspector/spec.md is the
//   contract authority; these tests rode in
//   runtime-invalidation-commits.test.ts when §1 landed and split out
//   again when that file outgrew the 400-line test-file gate — the
//   intents contract belongs to the inspector change, not the
//   runtime-invalidation change. The commit-stream helpers live in
//   tests/helpers/runtime-invalidation-rig.ts (shared with the
//   commits file).

import { describe, expect, it } from "vitest";

import type { DispatchCommit, Effect } from "../src/effects/dispatch.ts";
import {
  counterApp,
  incrementN,
  N_PATH,
  subscribable,
  stubFrames,
  unstubFrames,
} from "./helpers/runtime-invalidation-rig.ts";

describe("gallery-inspector — commit intents (add-gallery-inspector §1)", () => {
  // Task 1.0 — derives_from: commit exposes the applied intents
  it("a dispatched batch publishes as the commit's frozen intents array", () => {
    stubFrames();
    try {
      const app = counterApp();
      const commits: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => commits.push(commit));

      const batch: Effect[] = [incrementN(), ["noop-extra", 7]];
      app.dispatch(batch);

      expect(commits.length).toBe(1);
      const commit = commits[0] as DispatchCommit;
      // the normalized batch, same order, deep-equal
      expect(commit.intents).toEqual(batch);
      // frozen plain data: the array itself is frozen
      expect(Array.isArray(commit.intents)).toBe(true);
      expect(Object.isFrozen(commit.intents)).toBe(true);
      // the publish path copies: mutating the caller's array afterwards
      // must not change the published commit
      batch.push(["late", 1]);
      expect(commit.intents?.length).toBe(2);
    } finally {
      unstubFrames();
    }
  });

  // Task 1.0 — derives_from: commit exposes the applied intents
  it("a string dispatch normalizes to a one-element intents array", () => {
    stubFrames();
    try {
      const app = counterApp();
      const commits: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => commits.push(commit));

      app.dispatch("update", N_PATH, (n: unknown) => (n as number) + 1);

      expect(commits.length).toBe(1);
      const commit = commits[0] as DispatchCommit;
      expect(commit.intents?.length).toBe(1);
      expect(commit.intents?.[0]?.[0]).toBe("update");
    } finally {
      unstubFrames();
    }
  });

  // Task 1.0 — derives_from: commit exposes the applied intents
  it("a lane-only batch still carries its lane intent", () => {
    stubFrames();
    try {
      const app = counterApp();
      const commits: DispatchCommit[] = [];
      subscribable(app).subscribe((commit) => commits.push(commit));

      app.dispatch(["lane", "hover", (state: unknown) => state]);

      expect(commits.length).toBe(1);
      const commit = commits[0] as DispatchCommit;
      // the lane-only ChangeSet carries the lane marker, the intent the
      // batch applied is still on the commit
      expect(commit.changes.kind).toBe("unknown");
      expect(commit.intents?.[0]?.[0]).toBe("lane");
    } finally {
      unstubFrames();
    }
  });
});
