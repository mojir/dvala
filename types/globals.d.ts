// Build-time-replaced constants (see each package's rolldown define and the
// vitest `define` in vite.config.mts).

// The monorepo version, injected into @mojir/dvala-common/buildReferenceData so
// the playground can show it without a cross-package root package.json import.
declare const __DVALA_VERSION__: string
