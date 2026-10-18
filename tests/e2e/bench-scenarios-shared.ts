// Purpose: the invariant half of the bench scenario registry
//   (tambor-54j.14/.19 split) — the Scenario shape and the view-point
//   resolvers shared by tests/e2e/bench-scenarios.ts (the main rows)
//   and tests/e2e/bench-scenarios-bz.ts (the BZ rows).
// Responsibilities: only what both registry halves need — the
//   Scenario shape (with the expectedDrawn / expectedText "the op
//   actually happened" checks), the view-point resolvers (button
//   text, first visible todo row, form label — fixed control-row /
//   list-head positions).
// Rationale: the registry outgrew the pretender gate's file limit a
//   second time (wave 3 of the benchmark programme); splitting rows
//   keeps every file under the limit WITHOUT changing any scenario id
//   (test names are contract bindings), and the shape + resolvers live
//   here so neither rows file duplicates the other's vocabulary.

import type { Elem } from "../../src/views/model.ts";
import { buttonPoint, pointWhere, type ViewPoint } from "./drive.ts";

// A view-point resolver: the fresh in-process view the page's initial
// view equals (pure views over plain state).
export type PointOf = (view: Elem) => ViewPoint;

export interface Scenario {
  /** minimum drawn-descendant count the op must produce — a no-op op
   * (state update silently dropped) would measure overhead only */
  readonly expectedDrawn?: number;
  /** drawn text the ops must leave in the demo — the count/checksum
   * form of the same no-op guard for summary-line apps */
  readonly expectedText?: string;
  readonly id: string;
  readonly app: string;
  readonly demoId: string;
  readonly pointsOf: readonly PointOf[];
  readonly setupOf?: PointOf;
  readonly ops: number;
  readonly warmupOps: number;
  /** drawn button texts cycled instead of the view-space points
   * (tambor-54j.17/.13): the in-process replay measures labels at
   * text.length (defaultMeasure) while the bundle configures real
   * text metrics, so a non-first button's replay point can fall
   * inside the drawn first button's box — scenarios whose no-op guard
   * distinguishes the ops click the drawn button's live DOM box
   * (the drive.ts clickDrawnText ground truth) instead */
  readonly drawnOps?: readonly string[];
  /** the drawn button text of the untimed setup op, clicked through the
   * same live-DOM box ground truth as drawnOps (tambor-54j.9: scenarios
   * whose setup button sits behind labels whose replay height diverges
   * from the bundle's real text metrics) */
  readonly drawnSetup?: string;
}

// The first visible row's toggle checkbox (list-head-stable position).
export const firstCheckbox: PointOf = (view) =>
  pointWhere(view, (f) => f.underHandler && f.node.type === "checkbox");

// The first visible row's delete X (list-head-stable position).
export const firstDeleteX: PointOf = (view) =>
  pointWhere(view, (f) => f.underHandler && f.node.type === "path");

// The op button with the given drawn text (fixed control-row position).
export const buttonText = (text: string): PointOf => (view) =>
  buttonPoint(view, text);

// A drawn label by its exact text (the form's field labels).
export const labelText = (text: string): PointOf => (view) =>
  pointWhere(view, (f) => f.node.type === "label" && f.node.text === text);
