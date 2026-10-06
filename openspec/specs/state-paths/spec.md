---
id: spec
kind: intent
statement: "THE path system SHALL address locations in the state tree with composable navigators and support select, set, update and delete over them immutably."
---

# state.paths

Port of the Specter subset that `membrane.component/path->spec` understands, plus the `ATOM`, `ALL`, `FIRST`, `LAST`, `MAP-VALS`, `META` and `END` special symbols. A path is an array whose elements are navigators, and nested arrays flatten. Navigators are typed data (`["keypath", "todos"]`, `["filter", pred]`) composed into `Path<S, T>` (typing.model typed_path), so effects that carry paths stay plain data. The `filter` navigator is Specter's `filterer`: the todo example depends on it so that editing or deleting a row in a filtered list changes the underlying list.

## Constraints

| id | kind | expr | traces_to |
|----|------|------|-----------|
| keypath_select | invariant | select(state, [keypath k1, keypath k2]) equals state[k1][k2], and undefined when any step is absent | [[spec]] |
| immutable_update | invariant | set, update and delete never mutate their input and return a new root | [[spec]] |
| structural_sharing | invariant | branches not on the updated path keep reference equality | [[spec]] |
| nth_navigator | invariant | nth(i) selects element i of a sequence, and on a map seq-nth(i) selects the i-th entry as a pair that keeps its map shape when written back | [[spec]] |
| entry_key_value | invariant | within a map entry pair, nth(0) addresses the key and nth(1) addresses the value | [[spec]] |
| filter_selects_subseq | invariant | filter(pred) selects the sub-sequence of matching elements, where a keyword predicate means truthiness of that field | [[spec]] |
| filter_merges_back | invariant | updating through filter(pred) rewrites matching elements in their original positions and leaves non-matching elements untouched | [[spec]] |
| filter_delete_removes | invariant | deleting an element through filter(pred) removes exactly that element from the underlying sequence | [[spec]] |
| take_drop_ranges | invariant | take(n) addresses the prefix of length min(n, count) and drop(n) the suffix from n, both writable | [[spec]] |
| nil_to_val | invariant | nilToVal(v) reads nil as v and writes through unchanged otherwise | [[spec]] |
| keypath_list | invariant | keypathList(ks) behaves like nested keypath steps, as get-in does | [[spec]] |
| collect_one | invariant | collectOne(path) prepends the value at path to the arguments of the update function, and several collectOne steps preserve their order | [[spec]] |
| nested_paths_flatten | invariant | a path containing nested path arrays behaves as their concatenation | [[spec]] |
| rest_args_map | invariant | restArgsMap views a flat key-value list as a map and writes back as a flat list | [[spec]] |
| delete_removes | invariant | deleting at a map key removes the key and at a sequence index splices the element | [[spec]] |
| special_navigators | invariant | ALL visits every element, FIRST and LAST address the ends, MAP_VALS visits map values, END addresses the insertion point after the last element, META addresses metadata | [[spec]] |
| path_serialisable | invariant | a path is a plain array, and JSON-serialisable except for navigators that hold a function, namely filter with a function predicate | [[spec]] |
| unknown_navigator_throws | invariant | an unrecognised navigator name raises an error naming it | [[spec]] |

## Model

### States

- `unresolved`
- `selected`
- `written`

### Transitions

| id | from | to | guard |
|----|------|----|-------|
| t_select | unresolved | selected | [[spec.keypath_select]] |
| t_write | selected | written | [[spec.immutable_update]] |

## Properties

| id | kind | derives_from | generator | predicate |
|----|------|--------------|-----------|-----------|
| p_select | unit | [[spec.keypath_select]] | random nested state | select matches direct indexing |
| p_immut | unit | [[spec.immutable_update]] | random updates | input deep-equals its prior snapshot |
| p_share | unit | [[spec.structural_sharing]] | random updates | sibling branches are reference-equal |
| p_nth | unit | [[spec.nth_navigator]] | maps and vectors | map entries written back keep a map |
| p_entry | unit | [[spec.entry_key_value]] | map obj with a and b | nth(0) of the first entry selects the key and nth(1) the value |
| p_filter_select | unit | [[spec.filter_selects_subseq]] | todos with mixed complete flags | the active filter selects exactly the incomplete todos |
| p_filter_merge | unit | [[spec.filter_merges_back]] | todos first second third with third complete | updating the second visible active todo changes original index 1 |
| p_filter_delete | unit | [[spec.filter_delete_removes]] | the same todos | deleting the second visible active todo leaves first and third |
| p_take_drop | unit | [[spec.take_drop_ranges]] | random n and sequences | take and drop address disjoint covering ranges |
| p_nil_val | unit | [[spec.nil_to_val]] | nil leaves | reads return the default |
| p_keypath_list | unit | [[spec.keypath_list]] | random key lists | equals nested keypath steps |
| p_collect | unit | [[spec.collect_one]] | cursor and select-cursor and text paths | the function is called with cursor, select-cursor, text in that order |
| p_flatten | unit | [[spec.nested_paths_flatten]] | random nested paths | selects equal the flat path |
| p_rest_args | unit | [[spec.rest_args_map]] | key-value lists | round-trip is lossless |
| p_delete | unit | [[spec.delete_removes]] | random keys and indices | key is absent or element is spliced |
| p_special | unit | [[spec.special_navigators]] | ALL, FIRST, LAST, MAP_VALS, END | each addresses its documented location |
| p_ser | unit | [[spec.path_serialisable]] | random paths | JSON round-trip is lossless for paths without a function predicate, and a keyword-style filter round-trips |
| p_unknown | unit | [[spec.unknown_navigator_throws]] | a bogus navigator | an error naming it is raised |

## Requirements

### Requirement: Property coverage mirror

Every property row is verified by exactly one dedicated scenario;
`ah sync` derives one contract per VERIFIES link.

#### Scenario: p_select

- **WHEN** random nested state
- **THEN** select matches direct indexing
- **VERIFIES** [[spec.p_select]]

#### Scenario: p_immut

- **WHEN** random updates
- **THEN** input deep-equals its prior snapshot
- **VERIFIES** [[spec.p_immut]]

#### Scenario: p_share

- **WHEN** random updates
- **THEN** sibling branches are reference-equal
- **VERIFIES** [[spec.p_share]]

#### Scenario: p_nth

- **WHEN** maps and vectors
- **THEN** map entries written back keep a map
- **VERIFIES** [[spec.p_nth]]

#### Scenario: p_entry

- **WHEN** map obj with a and b
- **THEN** nth(0) of the first entry selects the key and nth(1) the value
- **VERIFIES** [[spec.p_entry]]

#### Scenario: p_filter_select

- **WHEN** todos with mixed complete flags
- **THEN** the active filter selects exactly the incomplete todos
- **VERIFIES** [[spec.p_filter_select]]

#### Scenario: p_filter_merge

- **WHEN** todos first second third with third complete
- **THEN** updating the second visible active todo changes original index 1
- **VERIFIES** [[spec.p_filter_merge]]

#### Scenario: p_filter_delete

- **WHEN** the same todos
- **THEN** deleting the second visible active todo leaves first and third
- **VERIFIES** [[spec.p_filter_delete]]

#### Scenario: p_take_drop

- **WHEN** random n and sequences
- **THEN** take and drop address disjoint covering ranges
- **VERIFIES** [[spec.p_take_drop]]

#### Scenario: p_nil_val

- **WHEN** nil leaves
- **THEN** reads return the default
- **VERIFIES** [[spec.p_nil_val]]

#### Scenario: p_keypath_list

- **WHEN** random key lists
- **THEN** equals nested keypath steps
- **VERIFIES** [[spec.p_keypath_list]]

#### Scenario: p_collect

- **WHEN** cursor and select-cursor and text paths
- **THEN** the function is called with cursor, select-cursor, text in that order
- **VERIFIES** [[spec.p_collect]]

#### Scenario: p_flatten

- **WHEN** random nested paths
- **THEN** selects equal the flat path
- **VERIFIES** [[spec.p_flatten]]

#### Scenario: p_rest_args

- **WHEN** key-value lists
- **THEN** round-trip is lossless
- **VERIFIES** [[spec.p_rest_args]]

#### Scenario: p_delete

- **WHEN** random keys and indices
- **THEN** key is absent or element is spliced
- **VERIFIES** [[spec.p_delete]]

#### Scenario: p_special

- **WHEN** ALL, FIRST, LAST, MAP_VALS, END
- **THEN** each addresses its documented location
- **VERIFIES** [[spec.p_special]]

#### Scenario: p_ser

- **WHEN** random paths
- **THEN** JSON round-trip is lossless for paths without a function predicate, and a keyword-style filter round-trips
- **VERIFIES** [[spec.p_ser]]

#### Scenario: p_unknown

- **WHEN** a bogus navigator
- **THEN** an error naming it is raised
- **VERIFIES** [[spec.p_unknown]]

