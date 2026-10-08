// Purpose: executable contract tests for the typing.model spec — the
//   component and context contracts (derived dollar props, declared
//   defaults, the augmentable context interface, and defui's generic
//   props inference).
// Responsibilities: encode each converted row's generator and
//   predicate as a vitest test — expectTypeOf pins in-file plus
//   ts-expect-error pins for the rejected programs (type_tests_in_ci;
//   p_strict's project tsc run includes this file). The module
//   augmentation below mirrors the corpus generator: applications
//   extend the AppContext interface by declaration merging.
// Rationale: specs/typing-model.md is the design authority;
//   tambor-272 redistributed the monolithic tests/typing-model.test.ts
//   into topic files, keeping every it name byte-identical for the
//   --testNamePattern contract bindings.

import { expect, expectTypeOf, it } from "vitest";
import {
  label as labelNode,
  type Label,
} from "../src/views/model.ts";
import { key, root, type Path } from "../src/typing/path.ts";
import type { AppContext } from "../src/typing/context.ts";
import { defui, type CallProps } from "../src/typing/component.ts";

// p_context — applications extend the context type by declaration
// merging (context_augmentable).
declare module "../src/typing/context.ts" {
  interface AppContext {
    readonly theme: string;
  }
}

// The app state the dollar-props rows use.
interface RootState {
  readonly num: number;
  readonly nums: readonly number[];
}

// p_dollar — derives_from: typing.model.dollar_keys_derived
// generator: a component with props num and nums — predicate: the
// props type has dollar-num as Path<Root, number> and dollar-nums as
// Path<Root, number[]>, and omitting one errors
it("p_dollar: dollar props are derived with key remapping and are required", () => {
  const $num = key(root<RootState>(), "num");
  const $nums = key(root<RootState>(), "nums");
  type CounterProps = CallProps<
    { readonly num: number; readonly nums: readonly number[] },
    Record<never, never>,
    RootState
  >;
  expectTypeOf<CounterProps["$num"]>().toEqualTypeOf<Path<RootState, number>>();
  expectTypeOf<CounterProps["$nums"]>().toEqualTypeOf<Path<RootState, readonly number[]>>();
  const Counter = defui(
    (props: { readonly num: number; readonly nums: readonly number[] }) =>
      labelNode(String(props.num + props.nums.length)),
  );
  const el = Counter({
    num: 1,
    nums: [2, 3],
    $num,
    $nums,
  }) as Label;
  expect(el.type).toBe("label");
  expect(el.text).toBe("3");
  // omitting a dollar prop errors
  // @ts-expect-error omitting a dollar prop fails to compile
  Counter({ num: 1, nums: [2] });
});

// p_defaults — derives_from: typing.model.defaults_typed
// generator: selected-filter with a default — predicate: the call site
// may omit it and the body sees a defined value
it("p_defaults: a declared default is optional at the call site and defined in the body", () => {
  interface FilterState {
    readonly default: string;
  }
  const $default = key(root<FilterState>(), "default");
  const SelectedFilter = defui(
    (props: { readonly default: string }, context: AppContext) => {
      // the body sees a defined value
      expectTypeOf(props.default).toEqualTypeOf<string>();
      return labelNode(props.default);
    },
    { default: "filter" },
  );
  // the call site may omit it
  const el = SelectedFilter({ $default }) as Label;
  expect(el.type).toBe("label");
  expect(el.text).toBe("filter");
});

// p_context — derives_from: typing.model.context_augmentable
// generator: augment context with a theme field — predicate: the field
// is typed in every component
it("p_context: the context interface is augmentable and the built-in focus is present", () => {
  const $num = key(root<RootState>(), "num");
  const Context = defui(
    (props: { readonly num: number }, context: AppContext) => {
      // the augmented field is typed in the component
      expectTypeOf(context.theme).toEqualTypeOf<string>();
      return labelNode(context.theme);
    },
  );
  const el = Context(
    { num: 0, $num },
    { focus: undefined, theme: "dark" },
  ) as Label;
  expect(el.text).toBe("dark");
  // the built-in focus member is present in the base interface
  expectTypeOf<AppContext["focus"]>().toEqualTypeOf<unknown>();
});

// p_generic — derives_from: typing.model.component_generic
// generator: call counter with no num and with an extra prop —
// predicate: both are compile errors
it("p_generic: defui infers the props type; missing and extra props fail to compile", () => {
  const $num = key(root<RootState>(), "num");
  const Counter = defui((props: { readonly num: number }) => labelNode(String(props.num)));
  const el = Counter({ num: 3, $num }) as Label;
  expect(el.text).toBe("3");
  // @ts-expect-error calling with no num is a compile error
  Counter({ $num });
  // @ts-expect-error calling with an extra unknown prop is a compile
  // error
  Counter({ num: 1, $num, extra: 2 });
});
