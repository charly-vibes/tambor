// Purpose: the haptics layer of the corpus — a short vibration on
//   button taps where navigator.vibrate exists.
// Responsibilities: tapHaptics fires the short tap vibration through
//   the host's vibrate capability when present and does nothing —
//   without error — when it is absent.
// Rationale: openspec/specs/ui-mobile/spec.md haptics_optional is the design
//   authority: "a short vibration on button taps where navigator.vibrate
//   exists". The capability query is the call's argument, so headless
//   hosts (no navigator at all) are the absent case the no-error
//   property pins. No behavior beyond the corpus.

// The short tap vibration, in milliseconds.
export const TAP_VIBRATE_MS = 10;

// The host capability: navigator itself, a stub, or nothing.
export interface VibrateHost {
  vibrate?: (pattern: number) => boolean;
}

// A short vibration on button taps where navigator.vibrate exists;
// absent, nothing happens and nothing throws (haptics_optional).
export function tapHaptics(nav?: VibrateHost | null): void {
  const vibrate = nav?.vibrate;
  if (typeof vibrate === "function") {
    vibrate(TAP_VIBRATE_MS);
  }
}
