// Purpose: the app-level contract tests of the B9 reactive notebook
//   demo (tambor-54j.9) — the handler vocabulary over plain state:
//   text edits mark the cell dirty and launch, cursor moves don't,
//   slider moves launch with only that cell dirty, the run-applied
//   reply merges BY TOUCHED (untouched values keep their identity),
//   stale replies are ignored, a killed reply marks dirty ?? added and
//   leaves the rest consistent, the structural ops grow the notebook
//   and launch Full-mode runs, and the whole wire drives through
//   createNotebookApp's ordinary dispatch (no benchmark-specific path).
// Responsibilities: pin the dispatch semantics the browser e2e and the
//   bench scenario rely on — sync semantics against a silent runner,
//   reply application against the real in-thread fallback.
// Rationale: the identity-preserving merge is the app-level half of the
//   incremental contract (the core pins runAll; this pins the merge) —
//   a merge that cloned every reply would silently make every demo
//   repaint full while still reporting incremental counts.

import { describe, expect, it } from "vitest";
import {
  createNotebookApp,
  applyRunReply,
} from "../src/examples/notebook/notebook.ts";
import {
  cellSrcPath,
  notebookState,
  sliderNumPath,
  type NotebookState,
} from "../src/examples/notebook/notebook-state.ts";
import { runAll } from "../src/examples/notebook/notebook-core.ts";
import type { NotebookRunner } from "../src/examples/notebook/worker-client.ts";
import type { NotebookRunResponse } from "../src/examples/notebook/worker-main.ts";

// A runner that never answers: the pending run stays pending, so the
// sync post-dispatch assertions see the launch without a reply — and
// the heavy op never evaluates in-thread.
const silentRunner: NotebookRunner = {
  worker: false,
  run: () => new Promise<NotebookRunResponse>(() => {}),
  kill: () => {},
};

// Settle the in-thread fallback's reply (it applies on a microtask).
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// Dispatch helper: one effect vector, cast to the wire's batch type.
function send(app: ReturnType<typeof createNotebookApp>, effect: readonly unknown[]): void {
  app.dispatch([effect] as unknown as Parameters<typeof app.dispatch>[0]);
}

// The typing intent: insert text at cell idx's src path start.
function insertAt(idx: number, text: string): readonly unknown[] {
  return [
    "insert-text",
    text,
    cellSrcPath(idx),
    [["keypath", "::extra"], ["keypath", "cell-x"]],
  ];
}

describe("notebook app — notebookState", () => {
  it("boots the demo's 8 cells evaluated in-thread", () => {
    const s = notebookState();
    expect(s.cells).toHaveLength(8);
    expect(s.stats.ran).toBe(8);
    expect(s.stats.total).toBe(8);
    expect(s.runId).toBe(0);
    expect(s.pending).toBeNull();
    expect(s.mode).toBe("incremental");
    expect(s.out[5]?.err).toBeUndefined();
  });
});

describe("notebook app — edits launch incremental runs", () => {
  it("a text edit updates the cell's src and launches with that cell dirty", async () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["add"]);
    await settle();
    send(app, insertAt(8, "2"));
    const s = app.getState() as NotebookState;
    expect(s.cells[8]?.src).toBe("21 + 1");
    expect(s.runId).toBe(2);
    expect(s.pending?.dirty).toEqual([9]);
  });

  it("a slider move launches with only the slider's cell dirty", () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["update", sliderNumPath(6), () => 2]);
    const s = app.getState() as NotebookState;
    expect(s.sliders[6]).toBe(2);
    expect(s.pending?.dirty).toEqual([6]);
  });

  it("cursor-only intents change nothing and launch nothing", () => {
    const app = createNotebookApp(silentRunner);
    const before = app.getState() as NotebookState;
    send(app, [
      "backward-char",
      cellSrcPath(0),
      [["keypath", "::extra"], ["keypath", "cell-1"]],
    ]);
    const s = app.getState() as NotebookState;
    expect(s.runId).toBe(before.runId);
    expect(s.pending).toBeNull();
  });

  it("a Kill dispatch routes to the runner's kill", () => {
    let kills = 0;
    const app = createNotebookApp({
      worker: false,
      run: () => new Promise<NotebookRunResponse>(() => {}),
      kill: () => {
        kills += 1;
      },
    });
    send(app, ["kill"]);
    expect(kills).toBe(1);
  });
});

describe("notebook app — the reply merge", () => {
  it("merges by touched: untouched values keep their identity", () => {
    const s0 = notebookState();
    const r = runAll(s0.cells, { 6: 2 }, s0.out, [6]);
    const resp = { ...r, id: 1, ok: true } as unknown as NotebookRunResponse;
    const s1 = applyRunReply({ ...s0, runId: 1, pending: { dirty: [6], added: [] } }, resp);
    expect(s1.stats.ran).toBe(3);
    expect(s1.out[2]).toBe(s0.out[2]); // identity preserved
    expect(s1.out[7]).not.toBe(s0.out[7]); // zs recomputed
    expect(s1.pending).toBeNull();
  });

  it("ignores stale replies (a superseded run's)", () => {
    const s0 = notebookState();
    const r = runAll(s0.cells, { 6: 2 }, s0.out, [6]);
    const s1 = applyRunReply({ ...s0, runId: 5, pending: { dirty: [6], added: [] } }, {
      ...r,
      id: 4,
      ok: true,
    } as unknown as NotebookRunResponse);
    expect(s1.pending).not.toBeNull(); // untouched — reply was stale
    expect(s1.stats).toBe(s0.stats);
  });

  it("a killed reply marks dirty cells with the killed error and keeps the rest", () => {
    const s0 = notebookState();
    const s1 = applyRunReply({ ...s0, runId: 1, pending: { dirty: [3], added: [] } }, {
      id: 1,
      ok: false,
      message: "killed",
    });
    expect(s1.out[3]?.err).toBe("killed");
    expect(s1.out[5]?.err).toBeUndefined(); // the rest keeps its values
    expect(s1.pending).toBeNull();
  });

  it("a killed full run marks the added cells (the +100 heavy kill)", () => {
    const s0 = notebookState();
    const added = [9, 10, 11];
    const s1 = applyRunReply({ ...s0, runId: 2, pending: { dirty: null, added } }, {
      id: 2,
      ok: false,
      message: "killed",
    });
    for (const id of added) expect(s1.out[id]?.err).toBe("killed");
    expect(s1.out[5]?.err).toBeUndefined();
  });

  it("a load failure records the error line and clears pending", () => {
    const s0 = notebookState();
    const s1 = applyRunReply({ ...s0, runId: 1, pending: { dirty: [1], added: [] } }, {
      id: 1,
      ok: false,
      message: "notebook worker failed to load",
    });
    expect(s1.err).toContain("failed to load");
    expect(s1.pending).toBeNull();
  });
});

describe("notebook app — the structural ops", () => {
  it("+cell appends one cell and launches a full run", () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["add"]);
    const s = app.getState() as NotebookState;
    expect(s.cells).toHaveLength(9);
    expect(s.cells[8]?.src).toBe("1 + 1");
    expect(s.pending?.dirty).toBeNull();
    expect(s.pending?.added).toEqual([9]);
  });

  it("+200 chained appends a slider feeding a 200-cell chain", () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["chain"]);
    const s = app.getState() as NotebookState;
    expect(s.cells).toHaveLength(209);
    expect(s.nextId).toBe(210);
    expect(s.pending?.dirty).toBeNull();
    expect(s.pending?.added).toHaveLength(201);
  });

  it("+200 fan-out appends 200 sums over xs", () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["fan"]);
    const s = app.getState() as NotebookState;
    expect(s.cells).toHaveLength(208);
    expect(s.pending?.added).toHaveLength(200);
  });

  it("+100 heavy appends the kill target's cells", () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["heavy"]);
    const s = app.getState() as NotebookState;
    expect(s.cells).toHaveLength(209);
    expect(s.pending?.added).toHaveLength(201);
  });

  it("+1 chain bumps the chain base through its slider path and launches dirty", async () => {
    const app = createNotebookApp();
    send(app, ["chain"]);
    await settle(); // the full-run reply: the chain's info is known
    const s0 = app.getState() as NotebookState;
    const base = s0.chainBase;
    expect(base).not.toBeNull();
    expect(s0.sliders[base as number] ?? s0.info[base as number]?.input?.[3]).toBe(1);
    send(app, ["chain-bump"]);
    const s = app.getState() as NotebookState;
    expect(s.sliders[base as number]).toBe(2);
    expect(s.pending?.dirty).toEqual([base]);
    expect(s.pending?.added).toEqual([]);
  });

  it("+1 chain before any chain is a no-op", () => {
    const app = createNotebookApp(silentRunner);
    const before = app.getState() as NotebookState;
    send(app, ["chain-bump"]);
    expect(app.getState()).toBe(before);
  });

  it("the mode toggle flips without launching", () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["mode"]);
    expect((app.getState() as NotebookState).mode).toBe("full");
    send(app, ["mode"]);
    expect((app.getState() as NotebookState).mode).toBe("incremental");
  });

  it("Reset restores the demo notebook", async () => {
    const app = createNotebookApp(silentRunner);
    send(app, ["add"]);
    await settle();
    send(app, ["reset"]);
    const s = app.getState() as NotebookState;
    expect(s.cells).toHaveLength(8);
    expect(s.stats.ran).toBe(8);
  });
});

describe("notebook app — the end-to-end in-thread wire", () => {
  it("an edit's fallback reply applies through dispatch and updates the value", async () => {
    const app = createNotebookApp();
    // append an "1 + 1" cell, let its full-run reply apply, then edit:
    // "21 + 1" evaluates to 22 through the in-thread fallback runner
    send(app, ["add"]);
    await settle();
    expect((app.getState() as NotebookState).out[9]?.v).toBe(2);
    send(app, insertAt(8, "2"));
    await settle();
    const s = app.getState() as NotebookState;
    expect(s.cells[8]?.src).toBe("21 + 1");
    expect(s.out[9]?.v).toBe(22);
    expect(s.pending).toBeNull();
  });

  it("a slider move re-runs only the dependent closure in incremental mode", async () => {
    const app = createNotebookApp();
    send(app, ["update", sliderNumPath(6), () => 2]);
    await settle();
    const s = app.getState() as NotebookState;
    expect(s.stats.ran).toBe(3); // amp, zs, plot(xs, zs)
  });
});
