// Purpose: the SPA boot-selection contract (deep links) — the query
//   string rules the gallery entry's first mount depends on.
// Responsibilities: pin every rule bootSelection documents: the FIRST
//   `demo` value selects the registry entry whose id matches exactly
//   (case- and whitespace-sensitive); an absent, unknown or malformed
//   value selects the first entry; `debug` is true only for an
//   explicit "1"; duplicate parameters keep their first occurrence; and
//   no input throws.
// Rationale: pure vitest, no DOM — the e2e seam spec drives the same
//   rules through the real entry (nav active state + drawn content);
//   this file owns the parser's edges, which a browser test cannot
//   enumerate as cheaply. The registry shape is the only thing the
//   parser reads (id), so the stand-ins carry ids alone — the id, not
//   the nav title, is the match key (id "select" renders as
//   "dropdown").

import { describe, expect, it } from "vitest";
import { bootSelection } from "../src/spa/boot-selection.ts";

const demos = [
  { id: "todo" },
  { id: "counter" },
  { id: "select" },
] as const;

const first = 0;

describe("bootSelection — demo", () => {
  it("selects the index of a known id", () => {
    expect(bootSelection("?demo=counter", demos).demoIndex).toBe(1);
    // the id is the match key even when it differs from the nav title
    expect(bootSelection("?demo=select", demos).demoIndex).toBe(2);
  });

  it("defaults to the first demo without a demo parameter", () => {
    expect(bootSelection("", demos).demoIndex).toBe(first);
    expect(bootSelection("?", demos).demoIndex).toBe(first);
    expect(bootSelection("?debug=1", demos).demoIndex).toBe(first);
  });

  it("defaults to the first demo for an unknown id", () => {
    expect(bootSelection("?demo=does-not-exist", demos).demoIndex).toBe(first);
    expect(bootSelection("?demo=todo%2Fcounter", demos).demoIndex).toBe(first);
  });

  it("keeps the first demo occurrence when demo repeats", () => {
    expect(bootSelection("?demo=todo&demo=counter", demos).demoIndex).toBe(0);
    expect(bootSelection("?demo=counter&demo=todo", demos).demoIndex).toBe(1);
    // an unknown FIRST value never falls through to a later match
    expect(bootSelection("?demo=nope&demo=counter", demos).demoIndex).toBe(
      first,
    );
    // an empty first value wins the same way
    expect(bootSelection("?demo=&demo=counter", demos).demoIndex).toBe(first);
  });

  it("matches ids exactly (case- and whitespace-sensitive)", () => {
    expect(bootSelection("?demo=Counter", demos).demoIndex).toBe(first);
    expect(bootSelection("?demo=COUNTER", demos).demoIndex).toBe(first);
    expect(bootSelection("?demo=counter%20", demos).demoIndex).toBe(first);
    expect(bootSelection("?demo=%20counter", demos).demoIndex).toBe(first);
    // a bare parameter has an empty value, not the id of its name
    expect(bootSelection("?demo", demos).demoIndex).toBe(first);
  });
});

describe("bootSelection — debug", () => {
  it("is true only for an explicit 1", () => {
    expect(bootSelection("?debug=1", demos).debug).toBe(true);
    for (const value of ["0", "true", "yes", "", "2", " 1", "01"]) {
      expect(bootSelection(`?debug=${value}`, demos).debug).toBe(false);
    }
    expect(bootSelection("", demos).debug).toBe(false);
  });

  it("keeps the first debug occurrence", () => {
    expect(bootSelection("?debug=1&debug=0", demos).debug).toBe(true);
    expect(bootSelection("?debug=0&debug=1", demos).debug).toBe(false);
  });

  it("parses both parameters independently", () => {
    expect(bootSelection("?demo=counter&debug=1", demos)).toEqual({
      demoIndex: 1,
      debug: true,
      mode: "coalesced",
    });
  });
});

describe("bootSelection — malformed input", () => {
  it("never throws and yields an in-range selection", () => {
    const malformed = [
      "?",
      "?&&&",
      "?=",
      "?demo=",
      "?=demo",
      "??demo=todo",
      "?demo=%",
      "?demo=%E0%A4%A",
      "?%%%=%%",
      "?demo=counter&%",
      "?demo=todo&demo=",
      "?debug=%",
    ];
    for (const search of malformed) {
      const selection = bootSelection(search, demos);
      expect(selection.demoIndex, search).toBeGreaterThanOrEqual(0);
      expect(selection.demoIndex, search).toBeLessThan(demos.length);
      expect(selection.debug, search).toBe(false);
    }
  });

  it("survives an empty registry", () => {
    expect(bootSelection("?demo=todo", [])).toEqual({
      demoIndex: 0,
      debug: false,
      mode: "coalesced",
    });
  });
});