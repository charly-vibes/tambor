// Purpose: the SPA's render viewport constant (tambor-cie.2) — shared by
//   the todo mount and the gallery demos.
// Responsibilities: VIEWPORT — the [width, height] the backends report as
//   container size and the surface is attached at.
// Rationale: one constant keeps the gallery demos and the todo SPA
//   pixel-consistent; importing it avoids duplicating the literal across
//   spa modules (mount.ts previously owned it privately).

export const VIEWPORT: readonly [number, number] = [300, 300];
