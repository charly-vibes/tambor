// Purpose: the component/prop model every component builds on — the
//   defui port (component.model spec).
// Responsibilities: component declarations (exactly one parameter, a
//   symbol or a map pattern, rejected otherwise at definition time),
//   component calls that give every declared key k a value k and a path
//   $k with extra and context always implicit, prop defaults carrying a
//   nil-to-val path step, contextual props sourced from context, the
//   call-site fill for literal and non-literal maps, per-call-site extra
//   scratch keyed by the sorted explicit prop paths, memoized rendering
//   keyed by component name plus props (reset when any component is
//   redefined), and setWidth/setHeight by assoc.
// Rationale: specs/component-model.md is the design authority — never
//   improvise semantics beyond its constraint rows. It ports membrane's
//   defui (component.cljc) as exercised by defui_test.clj: extra is the
//   per-call-site scratch stored under ::extra of the parent, context is
//   state shared down the whole tree (top-level roots default to the
//   ::extra and ::context state entries, as component.cljc's
//   top-level-ui reads (::extra state) and (::context state)), and a
//   defaulted prop's path ends in a nil-to-val step so select(state, $p)
//   deep-equals the prop value at render time (path_resolves).

import type { Path } from "../effects/paths.ts";

// One key of a map pattern; `contextual` tags the key as sourced from
// the shared context (contextual_source).
export interface PropDecl {
  readonly key: string;
  readonly contextual?: true;
}

// A map pattern: :keys, :or and :as.
export interface MapDecl {
  readonly keys?: readonly (string | PropDecl)[];
  readonly defaults?: Readonly<Record<string, unknown>>;
  readonly as?: string;
}

// The two accepted forms of a component's single parameter
// (single_map_arg): a symbol or a map pattern.
export type ParamDecl = string | MapDecl;

// The props map a component's body receives: every key k carries its
// value under k and its path under $k; extra, $extra, context and
// $context are always present; an :as name is bound to the complete map
// (as_binding_whole_map), which is the props object itself.
export interface Props {
  readonly [key: string]: unknown;
}

// The call site of a component call: the enclosing component's extra
// and context (values and paths), and — for a non-literal call — the
// path of the map value passed (nonliteral_call_fill).
export interface CallSite {
  readonly extra?: unknown;
  readonly $extra?: Path;
  readonly context?: unknown;
  readonly $context?: Path;
  /** the map's own path, marking the call as non-literal */
  readonly $m?: Path;
}

export type Body = (props: Props) => unknown;

export interface Component {
  readonly name: string;
  readonly decl: ParamDecl;
  /** the declared prop keys, in declaration order */
  readonly keys: readonly string[];
  /** every declared prop p: the component receives both p and $p */
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly contextual: ReadonlySet<string>;
  readonly as: string | undefined;
  readonly body: Body;
}

// A component call is the elem a component call produces; rendering it
// runs the body. Nested calls inside a body's output resolve when the
// enclosing call renders (recursive_components).
export interface ComponentCall {
  readonly type: "tambor/component";
  readonly component: Component;
  readonly props: Props;
}

// The top-level roots of the scratch trees: component.cljc's
// top-level-ui reads the extra and context of the state itself.
export const ROOT_EXTRA_KEY = "::extra";
export const ROOT_CONTEXT_KEY = "::context";
const ROOT_EXTRA_PATH: Path = [["keypath", ROOT_EXTRA_KEY]];
const ROOT_CONTEXT_PATH: Path = [["keypath", ROOT_CONTEXT_KEY]];

// The components registry: redefinition resets the render cache
// (render_cached).
const registry = new Map<string, Component>();

// The keypath step for k, as plain data (state.paths).
function keypath(k: string | number): Path {
  return [["keypath", k]];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A component declaration has exactly one parameter, either a symbol or
// a map pattern, and anything else is rejected at definition time
// (single_map_arg).
export function defineComponent(
  name: string,
  params: readonly ParamDecl[],
  body: Body,
): Component {
  if (params.length !== 1) {
    throw new Error("defui arglist must have exactly one arg");
  }
  const decl = params[0] as ParamDecl;
  if (typeof decl !== "string" && !isPlainObject(decl)) {
    throw new Error(
      "defui arglist must have exactly one arg and it must be either a symbol or map.",
    );
  }

  const mapDecl: MapDecl = typeof decl === "string" ? {} : decl;
  const keys = (mapDecl.keys ?? []).map((k) =>
    typeof k === "string" ? k : k.key,
  );
  const contextual = new Set(
    (mapDecl.keys ?? [])
      .filter((k): k is PropDecl => typeof k !== "string" && k.contextual === true)
      .map((k) => k.key),
  );

  const component: Component = {
    name,
    decl,
    keys,
    defaults: mapDecl.defaults ?? {},
    contextual,
    as: mapDecl.as,
    body,
  };
  // any component redefinition resets the cache (render_cached)
  registry.set(name, component);
  return component;
}

// A component call: the child's props map is filled from the call site
// (the fill lives here because TypeScript has no macros to rewrite the
// call site the way defui's does).
export function call(
  component: Component,
  args: Record<string, unknown>,
  callsite: CallSite = {},
): ComponentCall {
  const props: Record<string, unknown> = {};
  // every declared key plus the two implicit keys, in declaration order
  // with extra and context appended (implicit_extra_context)
  const allKeys = [...component.keys];
  if (!allKeys.includes("extra")) allKeys.push("extra");
  if (!allKeys.includes("context")) allKeys.push("context");

  // the call site's scratch trees; a top-level call falls back to the
  // root ::extra / ::context entries
  const parentExtra = (callsite.extra ?? {}) as Record<string, unknown>;
  const parent$extra = callsite.$extra ?? ROOT_EXTRA_PATH;
  const context = (callsite.context ?? {}) as Record<string, unknown>;
  const $context = callsite.$context ?? ROOT_CONTEXT_PATH;

  for (const k of allKeys) {
    const $k = "$" + k;
    // the value: the call site's entry, absent falls to the defaults
    // (defaults_applied: absent or nil and a default is declared, the
    // default is the value)
    let value: unknown;
    if (k === "extra") {
      value = args.extra !== undefined ? args.extra : parentExtra;
    } else if (k === "context") {
      value = args.context !== undefined ? args.context : context;
    } else if (args[k] !== undefined) {
      value = args[k];
    } else {
      value = component.defaults[k];
    }
    // the path: the explicit dollar key in the map wins
    // (literal_call_paths); otherwise the scratch path
    let path: Path;
    if (k === "extra") {
      path = (args.$extra as Path | undefined) ?? parent$extra;
    } else if (k === "context") {
      path = (args.$context as Path | undefined) ?? $context;
    } else if (args[$k] !== undefined) {
      path = args[$k] as Path;
    } else {
      path = [...parent$extra, ...keypath(k)];
    }
    props[k] = value;
    props[$k] = path;
  }

  // the as name is bound to the complete props map including filled-in
  // defaults (as_binding_whole_map)
  if (component.as !== undefined) {
    props[component.as] = props;
  }
  return { type: "tambor/component", component, props };
}

// Rendering resolves a call's body output, replacing nested component
// calls with their rendered trees (recursive_components).
export function render(c: ComponentCall): unknown {
  return resolve(c.component.body(c.props), new Set());
}

function isCall(value: unknown): value is ComponentCall {
  return (
    isPlainObject(value) &&
    value["type"] === "tambor/component" &&
    isPlainObject(value["component"]) &&
    isPlainObject(value["props"])
  );
}

// Does the value contain a component call anywhere? The fast path lets
// unchanged frozen subtrees keep their identity.
function hasCall(value: unknown, seen: Set<unknown>): boolean {
  if (isCall(value)) return true;
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return (value as unknown[]).some((v) => hasCall(v, seen));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some((v) => hasCall(v, seen));
  }
  return false;
}

function resolve(value: unknown, seen: Set<unknown>): unknown {
  if (!hasCall(value, seen)) return value;
  if (isCall(value)) return render(value);
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => resolve(v, seen));
  }
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    out[k] = resolve(out[k], seen);
  }
  return out;
}
