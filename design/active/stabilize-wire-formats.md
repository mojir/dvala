# Stabilizing Dvala Wire Formats

## Why This Matters

Before porting the runtime to KMP, all cross-platform wire formats must be:
- **Specified** — not just implied by the TS implementation
- **Versioned** — with a migration path, not fatal mismatches
- **Validated** — on both serialization and deserialization
- **Tested** — with a cross-implementation conformance suite

Any ambiguity becomes a cross-platform bug when KMP produces or consumes these artifacts.

## Three Formats to Stabilize

### 1. Continuation Format (critical)
The wire contract for "suspend anywhere, resume everywhere." JSON blob containing the continuation stack, context stacks, and accumulated snapshots.

### 2. AST Format (critical)
The parsed representation of a Dvala program. Consumed by the evaluator on every platform. Currently a tuple-based format with numeric node types and inlined source positions.

### 3. Bundle Format (important, currently POC)
Precompiled Dvala programs for distribution. Currently in proof-of-concept state — now is the time to get it right before it becomes a cross-platform contract.

## Decisions

### Keep JSON as serialization format

Evaluated alternative formats (Protobuf, CBOR, FlatBuffers, MessagePack). Staying with JSON.

**Why JSON is the right fit:**
- **Dvala values are JSON-native** — null, number, string, boolean, array, object. No impedance mismatch.
- **Schema-based formats fight dynamic typing** — Protobuf/Avro want compile-time shapes. Dvala continuations contain arbitrary user values (`meta`, closure-captured variables, effect args). Ends up as `oneof` wrappers all the way down.
- **Human readability** — `cat continuation.json | jq .` is invaluable for debugging cross-platform resume failures. Binary formats require special tooling.
- **The problems we're solving aren't JSON's fault** — fragile indices, no validation, no versioning are application-level issues. A different format wouldn't fix them.

**What about MessagePack?** Same data model as JSON but binary-encoded (~30-50% smaller, faster to parse). Interesting in theory, but gzipped JSON is roughly the same size as gzipped MsgPack. Not worth adding a dependency on every platform and losing debuggability.

**Size strategy:** JSON + gzip at the host/transport layer. The host already controls storage (DB, S3, HTTP) and can trivially gzip there. No Dvala runtime changes needed.

### Drop the dedup pool

The v2 format introduced sub-tree pooling (`pool` field, `__poolRef` markers, content hashing via FNV-1a, 200-byte threshold). This deduplicates repeated AST sub-trees within the JSON blob to reduce size.

**Recommendation: remove it in v3.** Let the host handle compression (gzip) at the transport/storage layer instead.

**Arguments for dropping:**
- **Simplifies the wire format substantially** — removes `pool`, `__poolRef` markers, recursive expansion logic, `contentHash.ts`, `dedupSubTrees.ts`. That's ~400 lines of TS that would otherwise need wire-compatible reimplementation in KMP.
- **Fewer special markers** — `__csRef` is necessary (breaks circular refs), but `__poolRef` is purely an optimization. Fewer markers = simpler spec, fewer edge cases.
- **Gzip is better at this** — gzip compresses repeated byte sequences across the entire blob, not just structurally identical sub-trees above a size threshold. It typically achieves 70-90% compression on JSON, often beating the pool approach.
- **Less surface area for cross-platform bugs** — content hashing must produce identical results across implementations. FNV-1a is simple, but key ordering, floating-point serialization, and edge cases can diverge subtly between TS and Kotlin.
- **Host already controls storage/transport** — the host decides where to put the blob (DB, S3, HTTP). Adding gzip there is trivial and requires no Dvala changes.

**Arguments for keeping:**
- **Reduces in-memory size** — if the runtime holds many snapshots in memory (e.g., accumulated checkpoints), pooling reduces the object graph size before it ever becomes a string. Gzip only helps on-wire/on-disk.
- **Already works and is tested** — `dedupSubTrees.ts` and `contentHash.ts` exist, have tests, and are proven in production.
- **No external dependency** — pooling works without zlib/gzip. In constrained environments (embedded, edge workers), the host may not have easy access to compression.

**Verdict:** The in-memory argument is weak — if you're holding many snapshots, you already pay for the full deserialized object graph. The "already works" argument doesn't offset the cross-platform reimplementation cost. Drop it for v3, recommend gzip at the host layer.

### Separate source info from AST

Currently every AST node carries `sourceCodeInfo`. This has consequences:
- **Bloats continuation blobs** — every frame that carries AST nodes (most of them) includes source positions for every node in every sub-expression
- **Mixes concerns** — execution state and debug info are interleaved
- **Not needed in production** — source positions are only useful for error messages and debugging

**Arguments for separating (source map):**
- Smaller AST → smaller continuations → smaller serialized blobs
- Cleaner wire format — continuation blobs carry execution state, not debug info
- Production deployments can strip source maps entirely
- Source maps are a well-understood pattern (JS/CSS already do this)
- Easier to port — KMP only needs to handle the core AST, source maps are optional

**Arguments for keeping inlined:**
- Simpler — one tree, not two synchronized structures
- Error messages always have location info, even in production
- No risk of source map getting out of sync with AST

**Recommendation: separate.** Use a parallel structure that maps node paths or IDs to source positions. Ship the source map alongside the program (in bundles), but exclude it from continuation blobs by default. Provide a debug mode that includes source info in continuations for troubleshooting.

---

## Continuation Format

### Current State

The format works but is defined only by the TS code in `src/evaluator/suspension.ts`. Key concerns:

- **No formal specification** — frame type names, magic markers (`__csRef`, `^^fn^^`, `^^re^^`, `^^ef^^`), AST node encoding are all implicit
- **Fragile versioning** — version mismatch is fatal, no forward/backward compatibility, no migration path
- **No deserialization validation** — malformed JSON produces confusing errors deep in recursion
- **Fragile identifiers** — builtins referenced by numeric index (reordering breaks blobs), AST node types are numeric constants

### Plan

#### Step 1: Remove Dedup Pool
- Remove `pool` and `__poolRef` from the blob structure
- Remove `dedupSubTrees.ts`, `contentHash.ts` and their tests
- Remove pool expansion from deserialization
- Bump version to 3
- Update existing tests

#### Step 2: Document the Wire Format

Create `design/active/continuation-wire-format.md` specifying:

**Top-level structure:**
```
SuspensionBlob {
  version: number
  contextStacks: ContextStackEntry[]
  k: Frame[]
  meta?: Value
  snapshots?: SuspensionBlob[]
  nextSnapshotIndex?: number
}
```

**Value encoding** — exhaustive mapping of Dvala `Any` to JSON:
- `null` → `null`, `number` → JSON number, `string` → JSON string, `boolean` → JSON boolean
- `array` → JSON array (recursive), `object` → JSON object (recursive)
- `RegularExpression` → `{ "^^re^^": true, s: string, f: string }`
- `EffectRef` → `{ "^^ef^^": true, name: string }`
- `DvalaFunction` → per-subtype encoding (document all 14)

**Frame encoding** — for each of the 40+ frame types: type discriminator, required fields, ContextStack references, AST node fields.

**Special markers:** `{ __csRef: number }` — ContextStack back-reference.

#### Step 3: Stabilize Identifiers

**Frame type names** — audit all frame type strings. Ensure they are stable identifiers that won't change with TS refactoring.

**Builtin function references** — currently stored by numeric index (`normalBuiltinSymbolType`). This is the biggest fragility: adding, removing, or reordering builtins silently breaks every serialized continuation.

**Fix:** Serialize builtin references as **name strings** in the wire format. Map to/from numeric indices at the serialization boundary. The internal evaluator keeps using numbers for speed.
- `NormalBuiltinFunction`: `normalBuiltinSymbolType: 42` → `"name": "map"` in JSON
- `SpecialBuiltinFunction`: `specialBuiltinSymbolType: 3` → `"name": "if"` in JSON
- Module functions already use name-based references — this brings builtins in line

**AST node type constants** — currently numeric (`1` = Number, `2` = String, etc.). Recommendation: freeze the numeric mapping and document it in the spec. Node types are a small fixed set that changes rarely.

**Function type discriminators** — `"UserDefined"`, `"Builtin"`, `"Module"`, etc. Audit and freeze.

#### Step 4: Add Deserialization Validation

- Schema validation at the top level before deep recursion
- Frame validation: known type, required fields, valid ContextStack references
- Clear error messages: `"Invalid frame at k[3]: unknown frame type 'FooFrame'"`

#### Step 5: Versioning Strategy

- Define compatibility rules: patch (new optional fields) vs minor (structural changes)
- Forward compatibility: unknown fields preserved, unknown frame types produce clear errors
- Migration support: `migrate(blob, fromVersion, toVersion)` function

#### Step 6: Conformance Test Suite

Golden JSON blobs in `__tests__/continuation-format/`:
- `simple-arithmetic.json`, `closures.json`, `effects.json`, `circular-refs.json`, `multi-snapshot.json`, `all-frame-types.json`, `all-value-types.json`
- Round-trip tests: serialize → JSON → deserialize → re-serialize → compare
- Cross-implementation tests: TS-produced blobs must work in KMP and vice versa

#### Step 7: Freeze
Tag the spec, golden blobs become the conformance suite for any new runtime implementation.

---

## AST Format

### What Needs Specifying

- **Node type mapping** — freeze the numeric constants (or switch to strings). Document every node type with its payload structure.
- **Source map format** — define how node positions are stored separately. Options: array indexed by node ID, path-based mapping, or compact encoding similar to JS source maps.
- **AST versioning** — same strategy as continuations: version field, migration path, forward compatibility.

### Plan

1. Separate source info from AST — extract `sourceCodeInfo` into a source map structure
2. Spec the AST format — document node types, payload structures, source map format
3. Conformance suite — golden AST JSON files, round-trip tests, parse-in-TS-verify-in-KMP tests

---

## Bundle Format

### Current State

POC. Now is the time to design it properly.

### What a Bundle Should Contain

```
DvalaBundle {
  version: number
  ast: AstNode[]              // The parsed program (no source info)
  sourceMap?: SourceMap       // Optional: source positions for debugging
  source?: string             // Optional: original source text
  metadata?: {
    name?: string
    description?: string
    created: string           // ISO 8601 timestamp
    dvalaVersion: string      // Runtime version that produced this bundle
    requiredModules?: string[] // Modules the program imports
  }
}
```

### Design Considerations

- **AST-only, not source** — the bundle carries the parsed AST, not source text to re-parse
- **Source map optional** — included for debugging, stripped for production
- **Module dependencies declared** — host can verify all required modules before evaluation
- **Forward compatible** — unknown fields preserved, version field for migration

### Plan

1. Design the bundle format
2. Conformance suite — golden bundle files

---

## Files to Modify

- `src/evaluator/suspension.ts` — remove pooling, add validation, update versioning
- `src/evaluator/frames.ts` — audit frame type names
- `src/constants/constants.ts` — audit and freeze node type constants
- `src/builtin/interface.ts` — name-based builtin references in serialization
- `src/evaluator/serialization.ts` — extend validation
- `src/parser/` — separate sourceCodeInfo from AST nodes

## Files to Remove

- `src/evaluator/dedupSubTrees.ts` — pooling logic
- `src/evaluator/contentHash.ts` — FNV-1a hashing for pooling
- `src/evaluator/dedupSubTrees.test.ts` — pooling tests
- `src/evaluator/contentHash.test.ts` — hashing tests

## Files to Create

- `design/active/continuation-wire-format.md` — continuation format specification
- `design/active/ast-wire-format.md` — AST format specification
- `design/active/bundle-format.md` — bundle format specification
- `__tests__/continuation-format/` — golden continuation test fixtures + conformance tests
- `__tests__/ast-format/` — golden AST test fixtures + conformance tests
- `__tests__/bundle-format/` — golden bundle test fixtures + conformance tests

## Order of Operations

0. **Remove dedup pool** — simplify before specifying
1. **Spec continuation format** — document what we have
2. **Audit and fix identifiers** — builtins to name-based, freeze node types
3. **Add validation** — catch malformed blobs early
4. **Versioning strategy** — ensure future changes don't strand existing blobs
5. **Separate source info from AST** — extract into source map
6. **Spec AST format** — document node types and source map
7. **Design bundle format** — define the container
8. **Conformance suites** — golden files for all three formats
9. **Freeze** — declare formats stable, tag specs
