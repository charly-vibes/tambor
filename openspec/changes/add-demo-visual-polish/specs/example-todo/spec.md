## MODIFIED Requirements

### Requirement: toggle_render

The toggle SHALL render the selected option as a plain label and every
other option as a clickable label in gray ink whose contrast against
the light-shell background is at least 4.5:1, separated by 5 px
spacers. The ink is characterized by its accessibility floor, not by a
literal value: any gray meeting the floor satisfies this requirement.

The deployed scenario [[example.todo.p_toggle_render]] continues to
verify this requirement; its THEN gains "and readable (contrast
≥ 4.5:1)" at archive time.
