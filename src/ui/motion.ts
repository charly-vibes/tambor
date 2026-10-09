// Purpose: the reduced-motion gate of the corpus — with
//   prefers-reduced-motion set, momentum and transitions are disabled.
// Responsibilities: prefersReducedMotion reads the media query through
//   an injected matcher; momentumSchedule turns a flick's velocity into
//   the scrollview's decaying momentum frames and schedules one
//   animation frame per frame through the host — none at all when the
//   media query is on.
// Rationale: openspec/specs/ui-mobile/spec.md reduced_motion is the design
//   authority: "with prefers-reduced-motion set, momentum and
//   transitions are disabled". The momentum frames themselves are the
//   scrollview's own (components.scrollview.momentum, which already
//   takes the reduced-motion flag and returns no frames when it is
//   set); this layer connects the media query to that flag and owns
//   the scheduling, so "no momentum frames are scheduled" is literally
//   zero animation frames when the query matches. No behavior beyond
//   the corpus.

import { momentumFrames } from "../components/scrollview/scrollview.ts";
import type { Vec2 } from "../views/model.ts";

// The media query the corpus names.
export const REDUCED_MOTION_QUERY = "prefers-reduced-motion";

// An injected media-query matcher: returns the query's match state, or
// null/undefined when the host does not know the query.
export type MediaQueryFn = (query: string) => { matches: boolean } | undefined | null;

// Whether the host reports prefers-reduced-motion as set.
export function prefersReducedMotion(match: MediaQueryFn): boolean {
  return match(REDUCED_MOTION_QUERY)?.matches === true;
}

// The host capabilities the scheduler needs: the media query, the
// animation-frame scheduler, and the offset applier the frames drive.
export interface MotionHost {
  readonly matchMedia: MediaQueryFn;
  raf(callback: () => void): unknown;
  apply(offset: Vec2): void;
}

// Schedule a flick's momentum: the scrollview's decaying frames, one
// animation frame each, in order — and no frames at all when the
// reduced-motion media query is on (reduced_motion).
export function momentumSchedule(
  start: Vec2,
  velocity: Vec2,
  total: Vec2,
  viewport: Vec2,
  host: MotionHost,
): readonly Vec2[] {
  const frames = momentumFrames(
    start,
    velocity,
    total,
    viewport,
    prefersReducedMotion(host.matchMedia),
  );
  for (const frame of frames) {
    host.raf(() => host.apply(frame));
  }
  return frames;
}
