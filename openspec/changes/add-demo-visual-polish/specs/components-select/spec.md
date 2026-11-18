## MODIFIED Requirements

### Requirement: header_label

The dropdown header SHALL show the label of the first option whose
value equals selected, and a gray no-selection text when none matches
or selected is nil. The no-selection ink is gray whose contrast
against the light-shell background is at least 4.5:1 — characterized
by its accessibility floor, not by a literal value.

The deployed scenario [[components.select.p_header_label]] continues to
verify this requirement; its THEN gains "meeting the 4.5:1 contrast
floor" at archive time.
