# Documentation Update — Post Effect-Based Host Interaction

**Status:** Approved
**Created:** 2026-04-10

## Goal

Bring documentation, examples, and README in sync with the effect-based host interaction changes and better showcase Dvala's killer features.

---

## Decisions

1. **README length**: Cut from ~1,500 to ~300-400 lines. Delete comprehensive syntax content — the book and reference docs cover it.
2. **Killer features**: Lead with (a) algebraic effects, (b) suspendable/serializable runtime, (c) time travel/snapshots. No host interaction in the hero — that's API docs.
3. **Language at a glance**: Skip. The three feature blocks have code examples. End with a playground CTA instead.
4. **New examples**: Add three runnable examples — `@dvala.env`, `@dvala.args`, and `@dvala.host` (with handler context). No suspend/resume example (better in the book).
5. **Book updates**: Brief additions to the existing standard effects list in `02-effects.md` (~30-50 lines). Small update to `04-suspension.md`.
6. **Comparison table**: No. Let the features speak for themselves.
7. **CHANGELOG**: No. Rely on auto-generated GitHub release notes.

## Implementation Plan

### Phase 1: README rewrite

1. Rewrite README.md (~300-400 lines):
   - Hero + one-liner + badges
   - What is Dvala (3-4 sentences)
   - Killer feature: Algebraic effects (with code example)
   - Killer feature: Suspendable & serializable (with code example)
   - Killer feature: Time travel / snapshots (with code example)
   - Quick start (npm install, hello world)
   - Links (Playground, Book, Reference, Examples, npm)

### Phase 2: New examples

2. Add `@dvala.env` example to `reference/examples.ts`
3. Add `@dvala.args` example
4. Add `@dvala.host` example (with effect handler in context)
5. Run example tests to verify all pass

### Phase 3: Book updates

6. Add `@dvala.host`, `@dvala.env`, `@dvala.args` to standard effects list in `02-effects.md`
7. Small update to `04-suspension.md` noting host values are now effects

### Phase 4: Verify

8. Run full check pipeline
9. Run e2e tests
10. Review rendered playground examples page
