// Purpose: the whiteboard demo's expected-pass geometry property — every
//   label the stage draws stays inside the drawn root, unclipped.
// Responsibilities: project the shared visual facts and assert off-root
//   and clipped text counts stay zero on every captured state; export the
//   shared stage actions and safety properties.
// Rationale: the 44px button floor grew rows inside a fixed stage, so text
//   escaping or clipped by the drawn root is the regression this guards.

import { always, now } from "@antithesishq/bombadil";
import { visualFacts as facts } from "./lib/visual.ts";

// The safety properties (noConsoleErrors, noUncaughtExceptions, ...) and
// the composite stage-scoped action generator. Default action generators
// are deliberately not exported — they would click the demo nav.
export {
  noConsoleErrors,
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
  stageActions,
} from "./lib/actions.ts";

// Text drawn off the stage root means a row escaped its parent's box — a
// layout regression, not a cosmetic offset. Pre-mount states pass.
export const textStaysInsideRoot = always(
  now(
    () =>
      facts.current.stagePresent === false ||
      facts.current.offRootTexts === 0,
  ),
);

// Clipped text means a row grew past its own box: the 44px floor must make
// rows taller, never cut their labels.
export const noClippedText = always(
  now(
    () =>
      facts.current.stagePresent === false || facts.current.clippedTexts === 0,
  ),
);