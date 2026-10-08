// Purpose: the augmentable render context of typing.model — the
//   context type components receive, with focus as a built-in member.
// Responsibilities: declare the AppContext interface; applications
//   extend it by declaration merging (context_augmentable), so every
//   component body sees the application's own fields typed.
// Rationale: specs/typing-model.md is the design authority. The
//   interface is the augmentation point on purpose: an app's
//   `declare module` merging lands in every component that names the
//   context parameter type. The runtime carrier in the app layer
//   (make-app's view context) feeds this interface at the call sites.

export interface AppContext {
  /** the built-in focus member (app.toplevel keeps focus in context) */
  readonly focus: unknown;
}
