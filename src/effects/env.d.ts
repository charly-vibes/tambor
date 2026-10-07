// Purpose: ambient declarations for the headless port targets.
// Responsibilities: type the host globals the effect dispatcher uses —
//   console (tap> reporting) and requestAnimationFrame (repaint
//   scheduling) — without pulling the DOM lib into the strict build.
// Rationale: tsconfig targets ES2022 with no DOM lib; the dispatcher
//   must still report unknown effects and schedule repaints on the
//   next animation frame, which these globals name.

declare var console: {
  log: (...data: unknown[]) => void;
};

declare var requestAnimationFrame:
  | ((callback: (time: number) => void) => number)
  | undefined;