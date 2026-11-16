// Purpose: the browser font seam (tambor-v3s) — resolve the face the demo
//   shell gives the drawn root, measure labels with it, and wait for it
//   before view construction.
// Responsibilities: hostFontSpec reads the computed family/size from a
//   probe attached to the body (the demo shell declares a bundled Inter
//   face; a detached probe would report document defaults); contextMeasure
//   returns the canvas-backed label measure; domMeasure wires them (the
//   jsdom fallback stays the unit measure); whenHostFontsReady awaits the
//   declared face plus FontFaceSet.ready so layout and glyphs agree.
// Rationale: layout offsets are computed at view-build time from label
//   measures, so measuring a fallback face and then painting the declared
//   one shifts every label (the drawn buttons painted at the UA's 13.33px
//   while layout measured 16px). The unit/fallback path is unchanged for
//   jsdom and structural hosts, which expose no canvas 2D context.

import type { HostDoc } from "../interop/domhost.ts";
import { measureUnit, type Font } from "../render/backend.ts";
import type { Vec2 } from "../views/model.ts";

// The canvas 2D surface the host seam exposes structurally (no lib.dom).
interface MeasureContext {
  font: string;
  measureText(text: string): { width: number };
}

// The font the host page gives the drawn root: a probe inherits the body
// CSS, so its computed family/size is the face the emitted spans render.
// Read while attached — a detached element's computed style falls back to
// document defaults and loses the face.
function hostFontSpec(doc: HostDoc): { size: number; spec: string } {
  const fallback = { size: 16, spec: "16px system-ui, sans-serif" };
  try {
    const probe = doc.createElement("span");
    probe.textContent = "M";
    doc.body.appendChild(probe);
    const computed = doc.defaultView?.getComputedStyle(probe);
    const fontSize = computed?.fontSize;
    const fontFamily = computed?.fontFamily;
    doc.body.removeChild(probe);
    const parsed = Number.parseFloat(fontSize ?? "");
    const size = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback.size;
    const spec =
      fontFamily === undefined || fontFamily === ""
        ? `${size}px system-ui, sans-serif`
        : `${size}px ${fontFamily}`;
    return { size, spec };
  } catch {
    // a host without computed styles keeps the structural fallback
    return fallback;
  }
}

// One line-box per source line (textarea bodies), width = the widest line
// — matches the pre-formatted span the DOM emission renders (tambor-0rp).
function contextMeasure(
  ctx: MeasureContext,
  size: number,
): (text: string, font?: Font | null) => Vec2 {
  return (text, _font) => {
    const lines = text.split("\n");
    let width = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > width) width = w;
    }
    return [width, size * lines.length];
  };
}

// Real font metrics for the mount path (tambor-0rp): measure text the way
// the emitted DOM spans will render it — canvas 2D measureText with the
// host's computed face. jsdom has no canvas 2D context (getContext returns
// null) — fall back to the unit measure; the structural contracts and the
// jsdom suite do not need metrics, only the real browser does.
// Exported for the browser entries, which also feed it to
// configureLabelMeasure so VIEW-build-time layout (bounds/verticalLayout)
// uses the same metrics the backend measures with.
export function domMeasure(doc: HostDoc): (text: string, font?: Font | null) => Vec2 {
  const unit = measureUnit;
  try {
    // The host seam has only createElement (no lib.dom); the canvas 2D
    // context is reached structurally, the same shape jsdom omits.
    const probeCanvas = doc.createElement("canvas") as unknown as {
      getContext(kind: string): MeasureContext | null;
    };
    const ctx = probeCanvas.getContext("2d");
    if (!ctx) return unit;
    const { size, spec } = hostFontSpec(doc);
    ctx.font = spec;
    return contextMeasure(ctx, size);
  } catch {
    return unit;
  }
}

// Wait for the shell's font face before view construction (tambor-v3s):
// layout is measured at view-build time, so measuring a fallback face and
// then painting the declared one shifts every label. `load` resolves even
// when the face is missing (the stack falls back); the catch only covers
// hosts without the FontFaceSet API.
export async function whenHostFontsReady(doc: HostDoc): Promise<void> {
  const fonts = doc.fonts;
  if (fonts === undefined) return;
  try {
    await fonts.load('16px "Tambor UI"');
    // `load` can resolve while the face is still settling in the
    // document's font set; `ready` is the point where layout and
    // measureText agree on the loaded face.
    if (fonts.ready !== undefined) await fonts.ready;
  } catch {
    // fall back to the declared stack; measure and paint use the same one
  }
}