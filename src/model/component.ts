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
import { cachedRender, clearRenderCache } from "./component-cache.ts";

const ROOT_EXTRA_PATH: Path = [["keypath", ROOT_EXTRA_KEY]];
const ROOT_CONTEXT_PATH: Path = [["keypath", ROOT_CONTEXT_KEY]];

// The render cache, keyed by component name plus an equal props map
// (render_cached). A props map that cannot be serialised (it carries a
// function) is never cached.
// A canonical serialisation of a props map for cache lookups: object
// keys sorted, cycles replaced by a placeholder. Returns null when the
// value carries a function and so cannot be keyed safely.
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
  // any component redefinition resets the cache (render_cached: the
  // cache is reset when any component is redefined)
  clearRenderCache();
  return component;
}

function hasKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

// The per-call-site extra scratch key, derived from the sorted explicit
// prop paths (call_site_identity): for a literal call the explicitly
// passed entries sorted by name; for a non-literal call the declared
// keys sorted by name, each carrying its path from the map when the map
// contains the key. Serialised so the same call site keeps the same
// extra across renders and different call sites get different extra.
function extraKeyOf(
  component: Component,
  args: Record<string, unknown>,
  nonliteral: boolean,
  $m: Path | undefined,
): string {
  const entries: unknown[] = nonliteral
    ? [...component.keys].sort().map((k) => {
        if (hasKey(args, "$" + k)) return [k, args["$" + k]];
        if (hasKey(args, k)) return [...($m as Path), ...keypath(k)];
        return [k, null];
      })
    : Object.keys(args)
        .sort()
        .map((k) => [k, args[k]]);
  return JSON.stringify(entries);
}

// A component call: the child's props map is filled from the call site
// (the fill lives here because TypeScript has no macros to rewrite the
// call site the way defui's does).
export function call(
  component: Component,
  args: Record<string, unknown>,
  callsite: CallSite = {},
): ComponentCall {
  // every declared key plus the two implicit keys, in declaration order
  // with extra and context appended (implicit_extra_context)
  const allKeys = [...component.keys];
  if (!allKeys.includes("extra")) allKeys.push("extra");
  if (!allKeys.includes("context")) allKeys.push("context");

  // a non-literal call knows the path of the map value it passes
  // (nonliteral_call_fill); a literal map is one written at the call site
  const nonliteral = callsite.$m !== undefined;
  const $m = callsite.$m;

  const ctx = callContext(component, args, callsite, nonliteral, $m);

  const props: Record<string, unknown> = {};
  for (const k of allKeys) {
    const $k = "$" + k;
    const { value, path } = propFor(k, component, args, ctx);
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

// Resolve the call-site and inherited context of one call: the call
// site's scratch trees (a top-level call falls back to the root
// ::extra / ::context entries), the child context (shared down the
// whole tree; explicit context keys in the map win), and the child's
// extra scratch addressed by the call-site key (call_site_identity).
function callContext(
  component: Component,
  args: Record<string, unknown>,
  callsite: CallSite,
  nonliteral: boolean,
  $m: Path | undefined,
): CallCtx {
  const parentExtra = (callsite.extra ?? {}) as Record<string, unknown>;
  const parent$extra = callsite.$extra ?? ROOT_EXTRA_PATH;
  const context = (callsite.context ?? {}) as Record<string, unknown>;
  const $context = callsite.$context ?? ROOT_CONTEXT_PATH;
  const childContext = (args.context !== undefined ? args.context : context) as Record<
    string,
    unknown
  >;
  const child$context = (args.$context as Path | undefined) ?? $context;
  const extraKey = extraKeyOf(component, args, nonliteral, $m);
  const extra = (args.extra !== undefined ? args.extra : (parentExtra[extraKey] ?? {})) as Record<
    string,
    unknown
  >;
  const $extra = (args.$extra as Path | undefined) ?? [...parent$extra, ...keypath(extraKey)];
  return { nonliteral, $m, extra, $extra, childContext, child$context };
}

// What one prop resolution needs: the resolved extra/context of the
// call plus the literal/nonliteral discriminator.
interface CallCtx {
  readonly nonliteral: boolean;
  readonly $m: Path | undefined;
  readonly extra: Record<string, unknown>;
  readonly $extra: Path;
  readonly childContext: Record<string, unknown>;
  readonly child$context: Path;
}

function propFor(
  k: string,
  component: Component,
  args: Record<string, unknown>,
  ctx: CallCtx,
): { value: unknown; path: Path } {
  if (k === "extra") return { value: ctx.extra, path: ctx.$extra };
  if (k === "context") return { value: ctx.childContext, path: ctx.child$context };
  if (component.contextual.has(k)) {
    // a contextual prop reads its value from context[k] and its path
    // is the context path plus keypath k; the call site cannot
    // override it (contextual_source)
    return { value: ctx.childContext[k], path: [...ctx.child$context, ...keypath(k)] };
  }
  return plainPropFor(k, component, args, ctx);
}

// The value: the call site's entry; missing values are filled from the
// scratch, then from the default (nonliteral_missing_vals).
function plainPropFor(
  k: string,
  component: Component,
  args: Record<string, unknown>,
  ctx: CallCtx,
): { value: unknown; path: Path } {
  let value = hasKey(args, k) ? args[k] : ctx.extra[k];
  const def = component.defaults[k];
  // when a prop is absent or nil and a default is declared the
  // default is the value (defaults_applied)
  if ((value === undefined || value === null) && def !== undefined) {
    value = def;
  }
  let path = plainPathFor(k, args, ctx);
  // a defaulted prop's path carries a nil-to-val step
  // (defaults_applied)
  if (def !== undefined) {
    path = [...path, ["nil-to-val", def]];
  }
  return { value, path };
}

// The path: an explicit dollar key in the map wins (literal_call_paths);
// for a non-literal call a missing dollar key is filled from the map
// value when the map contains the key and from the call-site scratch
// otherwise (nonliteral_call_fill).
function plainPathFor(k: string, args: Record<string, unknown>, ctx: CallCtx): Path {
  if (args["$" + k] !== undefined) return args["$" + k] as Path;
  if (ctx.nonliteral && hasKey(args, k)) {
    return [...(ctx.$m as Path), ...keypath(k)];
  }
  return [...ctx.$extra, ...keypath(k)];
}

// Rendering resolves a call's body output, replacing nested component
// calls with their rendered trees (recursive_components); equal props
// maps hit the render cache (render_cached).
export function render(c: ComponentCall): unknown {
  return cachedRender(c, () => resolve(c.component.body(c.props), new Set()).value);
}

function isCall(value: unknown): value is ComponentCall {
  return (
    isPlainObject(value) &&
    value["type"] === "tambor/component" &&
    isPlainObject(value["component"]) &&
    isPlainObject(value["props"])
  );
}

// Resolve a body output in a single pass: nested component calls render
// (recursive_components), containers rebuild only when something inside
// changed, and the seen set backtracks so shared subtrees resolve in
// every branch while self-referencing values (the as-binding) do not
// loop.
function resolve(
  value: unknown,
  seen: Set<object>,
): { value: unknown; changed: boolean } {
  if (isCall(value)) return { value: render(value), changed: true };
  const isContainer = Array.isArray(value) || isPlainObject(value);
  if (!isContainer) return { value, changed: false };
  const obj = value as object;
  if (seen.has(obj)) return { value, changed: false };
  seen.add(obj);
  const resolved = Array.isArray(obj)
    ? resolveArray(obj as unknown[], seen)
    : resolveObject(obj as Record<string, unknown>, seen);
  seen.delete(obj);
  return resolved;
}

function resolveArray(obj: readonly unknown[], seen: Set<object>): { value: unknown; changed: boolean } {
  const mapped = obj.map((v) => resolve(v, seen));
  const changed = mapped.some((r) => r.changed);
  return { value: changed ? mapped.map((r) => r.value) : obj, changed };
}

function resolveObject(obj: Record<string, unknown>, seen: Set<object>): { value: unknown; changed: boolean } {
  let changed = false;
  const outObj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const r = resolve(v, seen);
    changed = changed || r.changed;
    outObj[k] = r.value;
  }
  return { value: changed ? outObj : obj, changed };
}

// setWidth/setHeight (sizing_props): a component declaring width or
// height as props supports setWidth and setHeight by assoc — the call
// is rebuilt with the new prop, the paths untouched.
export function setWidth(c: ComponentCall, newWidth: number): ComponentCall {
  if (!c.component.keys.includes("width")) {
    throw new Error("can't set width — the component does not declare width");
  }
  return assocProp(c, "width", newWidth);
}

export function setHeight(c: ComponentCall, newHeight: number): ComponentCall {
  if (!c.component.keys.includes("height")) {
    throw new Error("can't set height — the component does not declare height");
  }
  return assocProp(c, "height", newHeight);
}

function assocProp(c: ComponentCall, key: string, value: number): ComponentCall {
  return { type: "tambor/component", component: c.component, props: { ...c.props, [key]: value } };
}

// The stretch flags are read from the component's stretch props
// (sizing_props).
export function stretchWidth(c: ComponentCall): boolean {
  return c.props["stretch-width"] === true;
}

export function stretchHeight(c: ComponentCall): boolean {
  return c.props["stretch-height"] === true;
}
