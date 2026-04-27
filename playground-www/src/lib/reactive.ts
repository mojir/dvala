// Reactive primitive for the playground UI.
//
// Re-exports from `@vue/reactivity` (the standalone, framework-agnostic
// Vue 3 reactivity package — independent of Vue itself, no compiler, no
// SFCs). Consumers should import from this module instead of
// `@vue/reactivity` directly so the underlying implementation can be
// swapped without touching call sites.
//
// Currently exports `reactive` (used to wrap the playground state
// singleton). `ref`, `effect`, and `computed` will be added here as soon
// as the first consumer needs them.
//
// Why a library over homemade: the five edge cases that matter
// (active-effect stack, dep cleanup before re-run, re-entrancy guard,
// `Object.is` equality, snapshot-subscribers-before-iterate) are exactly
// what `@vue/reactivity` handles in production. ~6 KB minified.

export { reactive } from '@vue/reactivity'
