// Purpose: interop.model — the macro tier as sugar: defui desugars to
//   the explicit API and is never required by the library
//   (macro_optional_tier).
// Responsibilities: defui(name, keys, render) returns a plain function
//   of props; the {:keys [k $k]} sugar derives a $k path binding from
//   the parent's path for every plain key the caller did not pass
//   explicitly, and an explicit pass always wins.
// Rationale: specs/interop-model.md is the design authority. The cljc
//   macro (experiments/macros.cljc) is compile-time sugar; this module
//   is its desugared runtime counterpart, kept in its own file — the
//   other interop modules import nothing from here, so the library
//   never requires the macro tier. p_macro_optional builds the todo
//   app with and without this sugar and expects deep-equal views and
//   effects.

/** The defui sugar: desugars to plain functions and explicit paths. */
export function defui(
  name: string,
  keys: readonly string[],
  render: (props: Record<string, unknown>) => unknown,
): (props: Record<string, unknown>) => unknown {
  void name;
  return (props: Record<string, unknown>): unknown => {
    const bound: Record<string, unknown> = { ...props };
    for (const key of keys) {
      const derived = `$${key}`;
      // the macro derives $k from the parent path; an explicit pass wins
      if (bound[derived] === undefined) {
        bound[derived] = [["keypath", key]];
      }
    }
    return render(bound);
  };
}
