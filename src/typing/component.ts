// Purpose: the typed component layer of typing.model — defui, the
//   derived dollar props, and the declared-defaults transform.
// Responsibilities: defui infers the props type from the render
//   function and calling a component with a missing required prop or
//   an extra unknown prop fails to compile (component_generic); the
//   call-site props type keeps each key k and adds a dollar-k of type
//   Path<Root, P[k]> via template-literal key remapping
//   (dollar_keys_derived); a declared default makes the prop optional
//   at the call site and non-optional inside the component body
//   (defaults_typed); the render function receives the augmentable
//   AppContext (context_augmentable).
// Rationale: specs/typing-model.md is the design authority. The dollar
//   keys and the optional-default transform are pure type-level
//   mappings over the inferred props; the runtime is the render call
//   with the defaults filled in, so nothing depends on a type
//   (types_erased). The dollar path's root is inferred at the call
//   site from the paths the caller passes.

import type { Elem } from "../views/model.ts";
import type { AppContext } from "./context.ts";
import type { Path } from "./path.ts";

/** The dollar-key remapping: each key k gains a `$k` of type
 * Path<Root, P[k]> (dollar_keys_derived). */
export type DollarProps<P extends object, Root> = {
  [K in keyof P & string as `$${K}`]: Path<Root, P[K]>;
};

/** The props keys a declared default makes optional at the call site
 * (defaults_typed). */
export type OptionalDefaults<D extends object> = {
  [K in keyof D]?: D[K];
};

/** The call-site props type: the required props, the defaulted props
 * made optional, and the derived dollar paths. */
export type CallProps<P extends object, D extends object, Root> =
  { [K in keyof P as K extends keyof D ? never : K]: P[K] } &
    OptionalDefaults<D> &
    DollarProps<P, Root>;

/** A component produced by defui: generic in the root state the
 * dollar paths point into. The context is the augmentable AppContext;
 * when the caller passes none the component falls back to a context
 * carrying only the built-in focus (an application's augmentation
 * fields are the caller's to supply). */
export interface DefuiComponent<P extends object, D extends object> {
  <Root>(props: CallProps<P, D, Root>, context?: AppContext): Elem;
}

/** defui infers the props type from the render function. */
export function defui<P extends object>(
  render: (props: P, context: AppContext) => Elem,
): DefuiComponent<P, Record<never, never>>;
/** defui with declared defaults: the defaulted props are optional at
 * the call site and non-optional in the body (the render signature
 * declares them required). */
export function defui<P extends object, D extends Partial<P>>(
  render: (props: P, context: AppContext) => Elem,
  defaults: Readonly<D>,
): DefuiComponent<P, D>;
export function defui<P extends object>(
  render: (props: P, context: AppContext) => Elem,
  defaults?: Readonly<Partial<P>>,
): DefuiComponent<P, Partial<P>> {
  const component = <Root>(
    props: CallProps<P, Partial<P>, Root>,
    context?: AppContext,
  ): Elem => {
    // the body sees a defined value: the defaults are filled in before
    // the render function runs
    const effective = context ?? ({ focus: undefined } as unknown as AppContext);
    return render({ ...defaults, ...props } as P, effective);
  };
  return component as DefuiComponent<P, Partial<P>>;
}
