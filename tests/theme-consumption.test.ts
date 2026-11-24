// Purpose: theme-consumption audit (add-demo-visual-polish task 6) — the
//   demo components paint their inks from the ambient theme roles, not
//   from literals: light renders the light token values and a dark
//   ambient install renders the dark ones.
// Responsibilities: render the select list, the todo delete X, the
//   textarea, the todo filter toggle and the closed dropdown header,
//   read the with-color inks off the drawn trees, and pin them against
//   tokenValue(role, scheme) before and after resolveAmbientTheme;
//   source-scan the consumer files so no literal pinned color array can
//   creep back in, including the mobile fixture's legacy inactive gray.
// Rationale: openspec/changes/add-demo-visual-polish design.md D6 — the
//   tokens flow one direction (demos read roles, ui/theme.ts owns the
//   values). Views are re-derived per draw, so the inks are read at
//   render time through ambientColor; the light values are bit-identical
//   to the literals they replaced (the existing contract tests stay
//   green), and a dark matcher must move every ink. The scan is
//   the enforcement half: literals would silently bypass the theme, so
//   the four files must carry none of the replaced arrays.

import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error node:fs has no type declarations here
import { readFileSync } from "node:fs";
// @ts-expect-error node:path has no type declarations here
import { resolve } from "node:path";

import { call, render } from "../src/model/component.ts";
import { clearRenderCache } from "../src/model/component-cache.ts";
import { dropdownList, SELECTED_FILL } from "../src/components/select/list.ts";
import { deleteX, toggle } from "../src/examples/todo/items.ts";
import { dropdown } from "../src/components/select/dropdown.ts";
import { BORDER_COLOR, textarea } from "../src/components/textarea/textarea.ts";
import { harnessState, propsOf } from "./helpers/textarea.ts";
import { scanOf } from "./helpers/scan.ts";
import { resolveAmbientTheme, type ThemeRole } from "../src/ui/ambient-theme.ts";
import { tokenValue } from "../src/ui/theme.ts";
import type { Path } from "../src/effects/paths.ts";
import type { Color, Elem, WithColorNode } from "../src/views/model.ts";

// The select scenario's options: this/that/the-other with "that"
// selected (row_visuals).
const OPTIONS: readonly (readonly [unknown, string])[] = [
  ["this", "This"],
  ["that", "That"],
  ["the-other", "The Other"],
];
const $SELECTED: Path = [["keypath", "selected"]];
const EXTRA_ROOT: Path = [["keypath", "::extra"]];

// The open dropdown-list on its own (the row paints are visible before
// the dropdown's interception).
function listView(): Elem {
  return render(
    call(dropdownList, {
      selected: "that",
      options: OPTIONS,
      $selected: $SELECTED,
      touch: false,
      extra: {},
      $extra: EXTRA_ROOT,
    }),
  ) as Elem;
}

// The bordered textarea (border_default): unfocused and unselected, so
// the border is its only ink.
function textareaView(): Elem {
  return textarea(propsOf(harnessState("hello", {})));
}

// The filter toggle with "all" selected (toggle_render): the two other
// option labels are the muted inactive ink.
function toggleView(): Elem {
  return toggle(["all", "active", "complete"], "all", $SELECTED);
}

// The closed dropdown header with a nil selection (header_label): its
// only ink is the muted no-selection text.
function noSelectionView(): Elem {
  return render(
    call(dropdown, {
      selected: null,
      options: OPTIONS,
      "open?": false,
      touch: false,
      extra: {},
      $extra: EXTRA_ROOT,
      $selected: $SELECTED,
      "$open?": [["keypath", "open?"]] as Path,
    }),
  ) as Elem;
}

// Every with-color ink in a drawn tree, in document order.
function inkColors(elem: Elem): Color[] {
  return scanOf(elem)
    .filter((f) => f.node.type === "with-color")
    .map((f) => (f.node as WithColorNode).color);
}

// The ambient roles the consumer views paint, each with the drawn tree
// that must carry it: light renders the light token value, dark the
// dark one, and the two must differ per role.
const ROLE_VIEWS: readonly (readonly [ThemeRole, () => Elem])[] = [
  ["accent", listView],
  ["danger", deleteX],
  ["border", textareaView],
  ["muted", toggleView],
  ["muted", noSelectionView],
];

// The three consumer files under audit and the literal arrays they
// used to carry (accent light, danger light, border light, the
// accessible gray).
const CONSUMERS: readonly string[] = [
  "src/components/select/list.ts",
  "src/examples/todo/items.ts",
  "src/components/textarea/textarea.ts",
];
const FORBIDDEN_LITERALS: readonly { readonly name: string; readonly shape: RegExp }[] = [
  { name: "accent light [0, 0.42, 1]", shape: /\[\s*0\s*,\s*0\.42\s*,\s*1\s*\]/ },
  { name: "danger light [1, 0, 0]", shape: /\[\s*1\s*,\s*0\s*,\s*0\s*\]/ },
  { name: "border light [0.65, 0.65, 0.65]", shape: /\[\s*0\.65\s*,\s*0\.65\s*,\s*0\.65\s*\]/ },
  { name: "accessible gray [0.45, 0.45, 0.45]", shape: /\[\s*0\.45\s*,\s*0\.45\s*,\s*0\.45\s*\]/ },
];

// The mobile fixture's toggle row used to draw the legacy inactive gray
// [0.8, 0.8, 0.8] (toggle_render); the muted role replaced it. The
// fixture's delete X keeps the ui-mobile geometry's own pinned red, so
// the fixture scan covers only the removed inactive gray.
const FIXTURE = "src/ui/fixture_todo.ts";
const LEGACY_INACTIVE_GRAY = /\[\s*0\.8\s*,\s*0\.8\s*,\s*0\.8\s*\]/;

describe("theme consumption (add-demo-visual-polish task 6)", () => {
  // Every test leaves the shared ambient cell back at its light default
  // and drops cached renders (the cache keys props only, so a stale
  // light list would otherwise answer the dark render).
  afterEach(() => {
    resolveAmbientTheme(() => null);
    clearRenderCache();
  });

  it("renders the light token values with no ambient install", () => {
    // the exported constants still name the light scheme's tokens
    expect(SELECTED_FILL).toEqual(tokenValue("accent", "light"));
    expect(BORDER_COLOR).toEqual(tokenValue("border", "light"));

    expect(
      inkColors(listView()),
      "the selected row fill is the light accent token",
    ).toContainEqual(tokenValue("accent", "light"));

    const x = inkColors(deleteX());
    expect(x).toHaveLength(2);
    for (const ink of x) {
      expect(ink, "the delete X strokes are the light danger token").toEqual(
        tokenValue("danger", "light"),
      );
    }

    expect(
      inkColors(textareaView()),
      "the bordered frame stroke is the light border token",
    ).toContainEqual(tokenValue("border", "light"));
  });

  it("renders the dark token values after a dark ambient install", () => {
    resolveAmbientTheme((query) => ({ matches: query.includes("dark") }));

    const list = inkColors(listView());
    expect(list, "the selected row fill is the dark accent token").toContainEqual(
      tokenValue("accent", "dark"),
    );
    expect(list).not.toContainEqual(tokenValue("accent", "light"));

    const x = inkColors(deleteX());
    expect(x, "the delete X strokes are the dark danger token").toContainEqual(
      tokenValue("danger", "dark"),
    );
    expect(x).not.toContainEqual(tokenValue("danger", "light"));

    const frame = inkColors(textareaView());
    expect(frame, "the bordered frame stroke is the dark border token").toContainEqual(
      tokenValue("border", "dark"),
    );
    expect(frame).not.toContainEqual(tokenValue("border", "light"));
  });

  it("every consumed role resolves through its token in both schemes", () => {
    for (const [role, draw] of ROLE_VIEWS) {
      expect(
        tokenValue(role, "light"),
        `${role} must have distinct light and dark values`,
      ).not.toEqual(tokenValue(role, "dark"));

      resolveAmbientTheme(() => null);
      clearRenderCache();
      expect(inkColors(draw()), `${role} light ink`).toContainEqual(
        tokenValue(role, "light"),
      );

      resolveAmbientTheme((query) => ({ matches: query.includes("dark") }));
      clearRenderCache();
      const dark = inkColors(draw());
      expect(dark, `${role} dark ink`).toContainEqual(tokenValue(role, "dark"));
      expect(dark, `${role} must not keep the light ink`).not.toContainEqual(
        tokenValue(role, "light"),
      );
    }
  });

  it("the consumers carry no literal pinned color arrays", () => {
    for (const file of CONSUMERS) {
      const text = readFileSync(resolve(file), "utf8");
      for (const literal of FORBIDDEN_LITERALS) {
        expect(
          literal.shape.test(text),
          `${file} still carries the ${literal.name} literal`,
        ).toBe(false);
      }
    }
  });

  it("the mobile fixture carries no legacy inactive gray literal", () => {
    const text = readFileSync(resolve(FIXTURE), "utf8");
    expect(
      LEGACY_INACTIVE_GRAY.test(text),
      `${FIXTURE} still carries the [0.8, 0.8, 0.8] inactive ink`,
    ).toBe(false);
  });
});