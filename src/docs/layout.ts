// Purpose: the docs shell layout builders (add-docs-site task 8.2) —
//   the two shell shapes the docs view derives: the stacked shell
//   (nav chrome + optional embed band + prose in one vertical column —
//   every non-demo page and the breakpoint's collapsed branch) and the
//   showcase shell (the same column riding a scrollview with the demo
//   in the scrollytelling pin, pinned at the pane top while its
//   section scrolls — design D5).
// Responsibilities: embedBand (the marker + stretch slot pair the
//   embed seam mounts the demo over); stackHeight (the stacked extent
//   of a column of elems); showcaseSection (the pin call — the
//   boundary "containing prose sections" spans the demo slot plus the
//   prose beneath, so the reserved span covers the body's drawn extent
//   at every activation state, spacer_matches_body_extent); the two
//   shell builders with their backdrops.
// Rationale: openspec/changes/add-docs-site/specs/docs-site/spec.md
//   "Scrollytelling showcase layout" is the design authority; the
//   scrollview's event-layer wrap nodes have no geometry entry (the
//   wireExtentSizing convention), so the showcase content is
//   stretch-resolved BEFORE the scrollview wraps it and the backdrop
//   beside the wrapped tree — never bounds()/resolveStretch() over the
//   event tree itself.

import { call, render } from "../model/component.ts";
import { scrollview } from "../components/scrollview/scrollview.ts";
import { pin } from "../scrollytelling/pin.ts";
import { label, rectangle, withColor } from "../views/nodes.ts";
import { resolveStretch, verticalLayout } from "../views/layout.ts";
import { bounds, height } from "../views/geometry.ts";
import type { Elem, Vec2 } from "../views/model.ts";
import type { Path } from "../effects/paths.ts";
import { ambientBackground, ambientColor } from "./theme.ts";
import { EMBED_SLOT_HEIGHT, embedMarker } from "./embeds.ts";

// The showcase scrollview's offset path (the docs pane's scroll state —
// the wheel intents update it; the view plugs it into context.scroll).
export const SCROLL_PATH: Path = [["keypath", "offset"]];

// The embed band (task 7.2): the marker label above a stretch slot
// that reserves the gallery viewport height — the demo stacks above
// the page's prose (design D3); the embed seam mounts the resolved
// demo over the slot. In the showcase the whole band rides the pin
// body (the marker and the slot pin together).
export function embedBand(id: string): Elem[] {
  // The full-width backdrop idiom (this shape, three sites in this
  // file): each band differs in height/color intent and a helper would
  // delete less than it adds — deliberate small duplication (review
  // A-DRAFT-002 closed with this note).
  return [
    withColor(ambientColor("body"), label(embedMarker(id))),
    withColor(
      ambientBackground(),
      rectangle(0, EMBED_SLOT_HEIGHT, { stretchWidth: true }),
    ),
  ];
}

// The stacked height of elems placed by the vertical layout — the
// running vstack offset totals (layout_reflows); nil for no elems.
// NOTE (review A-EXC-001, deferred): an allocation-free extent fold
// mirroring verticalLayout's gap formula would remove the two extra
// layout builds per showcase derive (wheel-tick path). Measured below
// the noise floor for now; revisit with scroll-profile data.
function stackHeight(elems: readonly Elem[]): number {
  return height(verticalLayout(elems));
}

// The showcase section (task 8.2, design D5): the demo rides in the
// scrollytelling pin body, pinned at the pane top while the prose
// section scrolls beneath it, releasing into flow at the boundary's
// end in the same frame (release_continuous). The boundary — "the Pin
// boundary containing prose sections" — spans the demo slot plus the
// prose beneath it: start = slot − duration, end = slot, so the pinned
// body sits at screen y = 0 and merges into native flow exactly when
// its slot reaches the top (no discontinuity at release). The duration
// must cover the body's drawn extent (the slot is EMBED_SLOT_HEIGHT
// tall): a shorter boundary would let the active translate shrink the
// pin's own group extents and reflow the layout under the cursor,
// defeating spacer_matches_body_extent — the reserved span must be
// present in untranslated flow at all times so the content height is
// unaffected by activation state.
function showcaseSection(
  id: string,
  scroll: Vec2,
  prose: readonly Elem[],
  slot: number,
): Elem {
  const proseH = stackHeight(prose);
  const duration = EMBED_SLOT_HEIGHT + proseH;
  const start = Math.max(0, slot - duration);
  return render(
    call(
      pin,
      { duration, body: embedBand(id), start },
      { context: { scroll } },
    ),
  ) as Elem;
}

// The showcase shell (task 8.2, design D5): the whole content column
// rides the scrollview and the demo rides the scrollytelling pin,
// pinned at the pane top while its section scrolls. The content is
// stretch-resolved BEFORE the scrollview wraps it (its event-layer
// wrap nodes have no geometry entry — the wireExtentSizing convention —
// so bounds/resolveStretch over the wrapped tree would throw) and the
// backdrop is resolved separately beside it.
export function showcaseShell(
  chrome: readonly Elem[],
  prose: readonly Elem[],
  demo: string,
  scroll: Vec2,
  size: Vec2,
): Elem {
  const slot = stackHeight(chrome) + 1;
  const content =
    verticalLayout([
      ...chrome,
      showcaseSection(demo, scroll, prose, slot),
      ...prose,
    ]) ?? [];
  const resolved = resolveStretch(content, size);
  const shell = render(
    call(
      scrollview,
      {
        offset: scroll,
        "scroll-bounds": size,
        body: resolved,
        $offset: SCROLL_PATH,
      },
    ),
  ) as Elem;
  const backdrop = withColor(
    ambientBackground(),
    rectangle(0, bounds(resolved)[1], { stretchWidth: true }),
  );
  return [resolveStretch(backdrop, size), shell];
}

// The stacked shell (task 6, design D3): the nav chrome, the optional
// embed band and the prose in one vertical column — the demo stacks
// above the prose (the pin's inactive flow), with a full-width
// backdrop behind the shell resolved against the container.
export function stackedShell(
  chrome: readonly Elem[],
  prose: readonly Elem[],
  demo: string | undefined,
  size: Vec2,
): Elem {
  const embed = demo === undefined ? [] : embedBand(demo);
  const shell = verticalLayout([...chrome, ...embed, ...prose]) ?? [];
  const backdrop = withColor(
    ambientBackground(),
    rectangle(0, bounds(shell)[1], { stretchWidth: true }),
  );
  return resolveStretch([backdrop, shell], size);
}