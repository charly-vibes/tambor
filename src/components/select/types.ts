// Purpose: the shared data shapes of components.select.
// Responsibilities: the Option pair and the Options vector — a dropdown
//   option is a [value, label] pair.
// Rationale: specs/components-select.md is the design authority:
//   "`options` is a vector of `[value, label]` pairs". Type-only module.

export type Option = readonly [value: unknown, label: string];
export type Options = readonly Option[];
