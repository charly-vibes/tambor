## ADDED Requirements

### Requirement: Site shell and navigation

The docs site SHALL render a persistent section navigation grouped by
reader journey (getting started, guides, reference, examples) listing
every page with the current page highlighted, and a content pane
rendering the selected page, so every page is reachable through the
navigation alone; the navigation SHALL be operable by keyboard alone,
and completing a page change SHALL move focus to the content pane.

#### Scenario: visitor navigates to a reference page

- **WHEN** the site mounts and the visitor selects a reference
  section in the navigation
- **THEN** the content pane renders that section's page and the
  navigation marks it as current

#### Scenario: keyboard-only navigation moves focus on page change

- **WHEN** the visitor, using only the keyboard, activates a
  navigation entry for a different page
- **THEN** the content pane renders the new page and DOM focus moves
  to the content pane's heading

#### Scenario: ungrouped page fails the build

- **WHEN** a content module declares no journey group
- **THEN** the build-time content check fails naming the module

### Requirement: Generated reference pages

The docs build SHALL generate one reference page per corpus spec by
embedding its `spec.md` verbatim under a provenance preamble naming
the source path, generated at build time and never hand-edited, with
a registry carrying each page's id, title, statement and a one-line
description, and SHALL fail the build when the corpus is missing or a
generated page's content diverges from its corpus file.

#### Scenario: corpus spec gets a verbatim page

- **WHEN** the content generator runs against the corpus
- **THEN** every `openspec/specs/<name>/spec.md` yields a page whose
  embedded content equals the corpus file byte-for-byte beneath a
  preamble carrying the source path

#### Scenario: corpus missing fails loudly

- **WHEN** the generator runs with the corpus directory absent
- **THEN** the generator exits non-zero naming the missing path
  instead of emitting partial content

### Requirement: Curated guides with validated links

The docs site SHALL carry hand-written guide pages that reference
reference pages only through typed page ids, extract every external
http(s) URL for validation, and the build SHALL fail on an unresolved
id, an id colliding with a generated page id, or a malformed external
URL; continuous integration SHALL additionally verify that external
URLs resolve.

#### Scenario: unresolved guide link fails the build

- **WHEN** a guide references a page id no generated or guide page
  defines
- **THEN** the build-time content check fails naming the guide and
  the unknown id

#### Scenario: malformed external URL fails the build

- **WHEN** a curated page carries an external URL that is not a valid
  http(s) URL
- **THEN** the build-time content check fails naming the page and the
  URL, while well-formed external URLs are emitted to a link inventory
  that CI verifies resolve

### Requirement: Tutorial and how-to guides

The curated pages SHALL cover all three narrative quadrants: a
quickstart tutorial that a developer can complete in under 15 minutes
to a meaningful working result, task-oriented how-to guides that each
lead through one named task to a verifiable outcome, and explanation
pages that state their prerequisites and define concepts before using
them.

#### Scenario: quickstart reaches a working result

- **WHEN** a developer follows the quickstart start to finish
- **THEN** they reach a running todo application built with tambor,
  within the 15-minute bar, with every snippet in the guide
  type-checked by the build

#### Scenario: how-to completes its named task

- **WHEN** a developer follows a how-to guide start to finish
- **THEN** the named task's outcome is achieved and verifiable in the
  running app (for example a composed form submitting, or
  drag-scrolling wired)

### Requirement: Demo embeds

A docs page SHALL embed an interactive demo by resolving it through
the gallery demo registry behind the dynamic-import boundary, so page
content modules ride the initial chunk without any demo example code.

#### Scenario: embed loads its demo on demand

- **WHEN** a page with a demo embed renders
- **THEN** the demo's example module resolves through a dynamic
  import and the drawn demo appears in the page without any example
  module appearing in the initial chunk

### Requirement: Scrollytelling showcase layout

On viewports at or above the breakpoint, a page that embeds a demo
SHALL pin the demo at a fixed viewport position beside the scrolling
narrative via the scrollytelling pin and release it at its section's
end without a visual jump; below the breakpoint the same page SHALL
stack the demo above its prose without pinning.

#### Scenario: demo pins beside scrolling prose and releases

- **WHEN** the visitor scrolls through a showcase section on a
  viewport at or above the breakpoint
- **THEN** the demo holds a constant viewport position while the
  section's prose scrolls, and at the section boundary it releases
  into flow in the same frame with no discontinuity in rendered
  position

#### Scenario: narrow viewport stacks without pinning

- **WHEN** the same page renders on a viewport below the breakpoint
- **THEN** the demo renders in native flow above its prose and no
  pin activation occurs at any scroll offset

### Requirement: Theme fidelity

The docs chrome (navigation, headings, body, code) SHALL color itself
only through the theme tokens of both `prefers-color-scheme` schemes,
with body-text contrast meeting WCAG AA (≥ 4.5:1) in each scheme as
computed from the token values, and no literal color in docs view
code.

#### Scenario: token audit and contrast hold in both schemes

- **WHEN** the docs view modules are audited and the token values are
  resolved for light and dark
- **THEN** no literal color appears outside the theme module, and
  every body-text token pair's contrast ratio is at least 4.5:1 in
  both schemes

### Requirement: Responsive re-derivation

The docs entry SHALL feed the host's live container size into the
backend so the view re-derives per size, SHALL collapse the section
navigation below the 600 px breakpoint into a top-bar dropdown, and
SHALL render without horizontal overflow at a 320 px viewport.

#### Scenario: resize reflows the layout

- **WHEN** the host container resizes across the breakpoint
- **THEN** the backend receives the new size, the re-derived view
  switches between the sidebar and collapsed-nav variants, and the
  rendered root fits the container width at 320 px with no horizontal
  overflow
