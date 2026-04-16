---
name: Type system design
description: Set-theoretic type system design — reviewed and accepted 2026-04-12, ready for implementation
type: project
---

Type system design is complete and reviewed. Design doc: `design/active/2026-04-12_type-system.md`

**Architecture:** Set-theoretic types with algebraic subtyping (Simple-sub). Side-table only (erased). Inference-first, annotations later.

**Key decisions from review (2026-04-12):**
- #16: Effectful macros removed — pure macros only (no type holes)
- #6 revised: No `Any` type — only `Unknown` + `Never`. Host boundary values runtime-validated against manifest types
- #5 revised: Record closed propagation — closed if all sources closed, params always open
- #17: Error recovery via `Unknown` per failed subexpression (sound, IDE-friendly)
- #18: `T[]` for arrays, `[T, U]` for tuples
- #19: Type parameter variance inferred from definition body
- `let rec`: monomorphic recursion only, polymorphic via annotations later
- Effect principality: settled — follows from Dolan's lattice result
- Step 0 runtime strictness: all changes shipped together in one release

**Implementation order:** Step 0 (runtime strictness) → Step 1 (core type algebra) → Step 2 (Simple-sub inference) → Step 3 (records/collections) → Step 4 (match narrowing) → Step 5 (atoms/tagged unions) → Step 6 (effect sets) → Step 7 (handler typing)

**Why:** Enables capability-safe execution, match exhaustiveness, effect tracking. Foundation for 0.6.0 and beyond.

**How to apply:** Start implementation at Step 0. The design doc is the source of truth. Favor readability over cleverness.
