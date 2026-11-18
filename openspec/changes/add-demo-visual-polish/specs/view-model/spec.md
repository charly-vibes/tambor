## MODIFIED Requirements

### Requirement: button_bounds

A button's bounds SHALL equal its label bounds plus 12 on each axis,
but SHALL never be smaller than 44 on either axis — the corpus touch
floor (ui.mobile.mobile_first) applied to what the visitor sees.

The deployed scenario [[view.model.p_button_bounds]] continues to
verify this requirement; its THEN becomes "bounds equal the
componentwise maximum of (label bounds plus [12, 12]) and [44, 44]" at
archive time.
