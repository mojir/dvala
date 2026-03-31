# Publisher Notes: The Dvala Book

> Reading as a publisher — notes on flow, gaps, and chapter-level feedback.
> Goal: make this a bestseller for developers building suspendable, agent-driven workflows.
>
> **Revision 2 — 2026-03-31.** Three new chapters added since the initial review:
> `02-core-language/05-strings.md`, `04-design-principles/06-testing.md`, `05-advanced/07-building-projects.md`.
> The `tutorials/` directory has been renamed to `book/`. See the **Update Notes** section below.

---

## Overall Impression

The book has a strong premise and a genuinely exciting subject. The core idea — programs that pause, serialize, and resume across time and machines — is one of the most compelling developer stories in years. The writing is clean, the code examples are interactive (huge plus), and the theoretical grounding (Lambda Papers, Plotkin & Pretnar) gives the book intellectual credibility.

The challenge: the book tries to be a language tutorial *and* a reference *and* a conceptual manifesto all at once. The seams show. Some chapters read like academic papers; others like API docs. The audience never fully comes into focus — is this for beginners to functional programming, or experienced developers evaluating Dvala for production use?

---

## Overall Flow Assessment

### Current chapter order

```
1. Getting Started
   1. Intro
   2. Getting Started (install / API)
2. Core Language
   1. Data Types
   2. Operators
   3. Lexical Scoping & Closures
   4. Functions
   5. Strings                           ← NEW
3. Data & Control Flow
   1. Collections
   2. Destructuring
   3. Control Flow
   4. Pattern Matching
   5. Loops & Recursion
   6. Pipes & Data Flow
4. Design Principles
   1. Expression-Oriented
   2. Immutability & Referential Transparency
   3. Purity & Side-Effect Discipline
   4. Normal vs Special Expressions
   5. Tail Call Optimization
   6. Testing                           ← NEW
5. Advanced
   1. Modules
   2. Effects & Handlers
   3. Color-Free Concurrency (Implicit Async)
   4. Suspension & Serializable Continuations
   5. Concurrency: parallel & race
   6. Macros
   7. Building Projects                 ← NEW
```

### What works

- **The hook is strong.** Ch 1.1 (Intro) leads with the big idea: serializable programs. This is the right call. Most language books start with hello-world; Dvala starts with the premise that will make a developer say "I need this."
- **Core language → data/control flow progression is sound.** The reader builds vocabulary naturally.
- **Ending on Macros** (an advanced power-user topic) makes sense for a language that prides itself on extensibility.

### What doesn't work

1. **The Design Principles section interrupts momentum.** After six chapters of hands-on coding, the reader hits four chapters of philosophy and computer science history. By Chapter 4.4 ("Normal vs Special Expressions") the energy completely dies. These principles are better woven into the chapters they belong to (e.g., immutability belongs in Data Types; TCO belongs in Loops).

2. **Effects appear out of nowhere in Ch 3.3.** The "Control Flow" chapter uses `perform(@dvala.error, ...)` and `handler...end` as if they're basic — but effects aren't introduced until Ch 5.2. First-time readers will be confused. Either (a) introduce a minimal "effects preview" earlier, or (b) move error handling to after Ch 5.2.

3. **Suspension — the killer feature — is buried in Ch 5.4.** The Intro sets the reader up to expect the serialization story to be central, but it takes until the second-to-last chapter to revisit it. Consider promoting Suspension much earlier, or adding a "Suspension in 5 Minutes" teaser after Ch 5.2 (Effects).

4. **Ch 5.3 (Implicit Async) is in the wrong place.** It's a short conceptual chapter explaining why there's no `async/await`. It would land better *immediately before* Ch 5.4 (Suspension), which is where the async story becomes concrete.

### Suggested restructure

```
1. Getting Started (unchanged)
2. Core Language (unchanged, but move Lexical Scoping closer to Functions)
3. Data & Control Flow (remove error handling from Ch 3.3; add cross-reference)
4. Functional Patterns (merge: Pipes, Collections, Immutability — practical "how do I transform data" arc)
5. Design Principles (trim to: Expression-Oriented, Purity, TCO — drop Normal vs Special)
6. Effects & Handlers (effects → errors → suspension → async → concurrency as one narrative arc)
7. Macros (unchanged, still last)
8. [NEW] Real-World Walkthrough (full example tying it all together)
```

---

## Gaps — What's Missing

### Critical gaps (will hurt adoption)

**1. No end-to-end real-world example.** *(still open)*
The Intro shows a 10-line AI approval workflow snippet. The rest of the book teaches syntax. There is no chapter that says: "here is a complete, working Dvala application — let's build it." The suspension story especially needs a complete walkthrough: create the workflow → run it → see it suspend → store the snapshot → resume it.

**2. Testing is mentioned but never taught.** ✅ *addressed — new Ch 4.6*
A new Testing chapter was added. See detailed review below.

**3. Multi-file project structure is unaddressed.** ✅ *addressed — new Ch 5.7*
A new Building Projects chapter was added. See detailed review below.

**4. JavaScript/TypeScript integration story is fragmented.** *(still open)*
The Intro promises "JavaScript Interoperability." Getting Started covers `bindings`. The Effects chapter covers host handlers. But there's no dedicated chapter that consolidates the full TypeScript API surface (createDvala, runAsync, resume, RunResult, Snapshot, effectHandlers patterns). A reader evaluating Dvala for production still needs to piece this together from multiple chapters.

### Significant gaps

**5. Built-in standard library overview.**
The Modules chapter now opens with a note about built-in functions requiring no import. But there are still hundreds of built-in functions (`map`, `filter`, `reduce`, `sort`, `count`, `keys`, `vals`, etc.) with no organized overview. The reader discovers them only through scattered examples. An appendix or reference page would help.

**6. Error taxonomy.**
What errors can Dvala programs encounter? What does the `dvala.error` payload look like? Are there different error subtypes? Is there a way to match on error type?

**7. What can and cannot be serialized.**
The Suspension chapter says everything in scope is preserved. But what about: closures that capture host-provided values (bindings)? Effects performed inside closures? Handlers installed at the host level? What happens if a snapshot is loaded into a Dvala instance with different modules installed?

**8. Performance guidance.**
When should a reader use `for` vs `loop/recur` vs `reduce` vs named recursion with `self`? When does operator-style chaining hurt performance vs pipes? There's no guidance on making performant choices.

**9. The REPL.**
Mentioned but described only as "start an interactive session." No guidance on how to use it for exploration, how multi-line expressions work, how to load files into it.

---

## Chapter-Specific Notes

### Ch 1.1 — Intro

- Strong opener. The "Programs That Wait" framing is the right hook.
- **Issue:** The very first code example is TypeScript, before the reader has seen any Dvala. This is fine, but `resume(snapshot, true)` lacks the import — readers won't know where `resume` comes from.
- The feature bullets ("Why This Matters") are excellent. Consider turning these into a table for scannability.
- The "A Taste of the Language" section at the end — the pipe/filter example is good, but the `factorial` example uses named recursion (`factorial(n - 1)`) that the book will later tell you to avoid for large inputs. Consider using `self` here to be consistent with the later TCO chapter.
- **Missing:** No mention of the license, the playground, or how to get help. The "Ready to dive in?" ending is abrupt.

### Ch 1.2 — Getting Started

- Good practical chapter.
- **Issue:** The individual modules example imports from `@mojir/dvala/modules/vector` — is this the real package path? Inconsistent with the earlier `@mojir/dvala/full` import style.
- **Issue:** No mention of TypeScript types — developers integrating Dvala into a TS project will immediately need `RunResult`, `Snapshot`, `DvalaError`, etc. A one-liner ("full TypeScript types are included") would reassure them.
- The CLI table is clean. Consider adding `dvala doc <name>` and `dvala list` to the table — these are extremely useful for exploration.
- **Missing:** How to run the playground locally.

### Ch 2.1 — Data Types

- Solid foundation chapter.
- **Issue:** The template string example uses `for (i in range(count(items)))` — this is a complex expression for a section introducing strings. Simplify the example.
- **Missing:** What happens with `NaN` and `Infinity`? Are they valid number values? Are they serializable?
- **Missing:** A quick "Dvala is dynamically typed" statement. Readers coming from TypeScript will want to know.
- The regexp section (`#"..."`) is brief — what are the supported flags? Can you do global matching?

### Ch 2.2 — Operators

- Clean chapter. The operator-as-function / function-as-operator duality is well-explained.
- **Issue:** Partial application with `_` is introduced here, but `_` is also the pipe placeholder. Readers will be confused when they later see `filter(_, isOdd)`. Add a forward reference or a note: "`_` in pipes is the same placeholder mechanism."
- The operator precedence is never stated. Readers coming from C-family languages will want to know: does `2 + 3 * 4` equal 14 or 20?

### Ch 2.3 — Lexical Scoping & Closures

- The Lambda Papers / Steele & Sussman opening is interesting but feels like a lecture. Consider moving the history to a sidebar or footnote.
- **Issue:** The `makeCounter` example (lines 104–117) correctly notes "each call to `c1()` starts from `n = 0` and returns 1" — but this will confuse readers coming from languages with mutable counters. They'll wonder "why would I want this?" Add a sentence explaining what *would* work (the shallow handler state pattern from Ch 5.2) and give a forward reference.
- The "Why Lexical Scoping Matters" bullet "Serialization" is good — it connects to Dvala's killer feature. Expand this slightly.

### Ch 2.4 — Functions

- Good, practical.
- `self` for recursion is elegant — make sure it's more prominent. It gets a two-line mention but this is a key differentiator from anonymous lambda recursion in other languages.
- **Missing:** Currying and partial application. The `_` placeholder from Ch 2.2 covers partial application, but there's no `curry` or mention of currying as a pattern.
- **Missing:** `partial` function if it exists.
- `comp` (right-to-left) is shown. Does left-to-right composition (`pipe`) exist? If so, it belongs here.
- **Missing:** Arity — how does Dvala handle calling a function with too many or too few arguments?

### Ch 2.5 — Strings ✅ *new chapter*

Good decision to give strings their own chapter — they were previously scattered between Data Types and the optional `string` module.

- Covers literals, templates, `++` / `str`, length, case, trim, slice, search, replace, split/join — a solid practical overview.
- **Standout:** The "Strings as Sequences" section is excellent. Showing that `map`, `filter`, `reverse`, and `first`/`rest` work on strings is both surprising and delightful for new readers.
- The `reMatch` regex section is clean. Showing the null-on-no-match behavior is important.
- **Issue:** The template string conditional example (`if temp > 20 then "warm" else "cold" end` inside `${}`) is great but uses `end` without explaining the `end` terminator appears inside the template string. First-time readers may be confused. A note: "full Dvala expressions, including `if...end`, work inside `${}`" would help.
- **Missing:** `startsWith` / `endsWith` — these are very common operations and their absence will surprise developers coming from most other languages. Do they exist? If not, show the `slice` / `indexOf` equivalents.
- **Missing:** Regex flags. The `#"..."` syntax is shown but there's no mention of case-insensitive matching or multiline mode. Even a "see the string module for flag support" note would help.
- **Missing:** String-to-number and number-to-string conversion. `str(42)` converts to string, but how do you parse `"42"` to a number? `toNumber`? This is a very common operation.
- **Placement note:** This chapter comes after Functions (Ch 2.4) but strings were already introduced in Data Types (Ch 2.1) and Operators (Ch 2.2 for `++`). Consider adding a brief "building on what you saw in Chapter 2.1" bridge sentence at the top.

### Ch 3.1 — Collections

- The chapter covers arrays, objects, and strings — but strings are covered in Ch 2.1. Reconsider the structure or add a clear statement: "strings are also sequences."
- **Missing:** `find` — finding the first element matching a predicate. This is one of the most common collection operations.
- **Missing:** `some`/`every` (or `any`/`all`) — testing if any/all elements satisfy a predicate.
- **Missing:** `flatMap` or equivalent — transforming and flattening.
- The "Building Arrays" section shows `range`, `repeat`, `push` but not `concat` / `++` for arrays (covered in operators but worth cross-referencing).

### Ch 3.2 — Destructuring

- Excellent chapter. Clean examples, logical progression.
- The `as` keyword for renaming (`name as userName`) is a nice feature. Make sure it's mentioned in the pattern matching chapter too (it is, but it deserves a cross-reference).
- **Issue:** Nothing about destructuring in `for` comprehensions — `for ({ name, age } in people)` would be very natural. Does it work? If so, show it.

### Ch 3.3 — Control Flow ✅ *improved since R1*

- **Fixed:** The no-`else` behavior is now explicit: "returns `null` when the condition is false — there is no 'void' or 'undefined', just `null`." Good.
- **Fixed:** The error handling section now has a prominent callout box noting effects aren't introduced until Ch 5.2. This directly addresses the R1 concern about unexplained forward references.
- The `do/end` section is still thin — consider adding the IIFE pattern as a sidebar.

### Ch 3.4 — Pattern Matching

- Strong chapter. The progression from simple to complex is well-executed.
- The "Practical Examples" section with HTTP response handling is excellent — this is exactly the kind of real-world grounding that's missing elsewhere.
- **Missing:** `match` on type — how do you branch on whether a value is a number vs string vs array? Using guards (`when isString(x)`) would work but this pattern deserves an explicit example.
- **Missing:** How does `match` interact with `null`? The default pattern (`case x = 10`) handles null — but this deserves its own subsection since null-safety is a Dvala feature.

### Ch 3.5 — Loops & Recursion

- Good coverage of three iteration strategies.
- **Issue:** The `fib` example (lines 78–83) uses `self` but is labeled "Self Recursion" with no mention that this is O(2^n). Add: "for large inputs, use `loop/recur` instead — see the TCO chapter."
- `for` with side effects (performing an effect inside `for`) is shown at the end. The interaction with effects/handlers deserves a note — does `for` produce the side effects in order? Can a `for` be inside a handler scope?
- **Missing:** `while`-style loop. Is there a way to loop while a condition is true without `loop/recur`? The `while` keyword exists in `for` comprehensions but only for early exit, not standalone.

### Ch 3.6 — Pipes & Data Flow

- Delightful chapter. The "data as functions" section (arrays as functions, numbers as functions, strings as functions, objects as functions) is genuinely novel and well-explained.
- **Issue:** `_ filter isOdd` (operator style) was already shown in Ch 2.2. Consolidate or explicitly say "this is the same feature from Chapter 2.2, now in the context of pipelines."
- The final "Putting it Together" example is excellent — real-world, readable, demonstrates the full philosophy. More like this throughout the book, please.

### Ch 4.1 — Expression-Oriented Design

- Good conceptual chapter but it restates things the reader already knows (if, do, match all return values). By this point the reader has been using these for 6 chapters.
- The academic framing (denotational semantics, Scott & Strachey) is interesting but optional — consider making it a sidebar.
- **The real value** in this chapter is the "Practical Benefits" section. Lead with that instead.

### Ch 4.2 — Immutability & Referential Transparency

- The `assoc` / `push` returning new values is already covered in Ch 3.1. Some repetition.
- **Good:** The bullet "Serializable continuations — Dvala can snapshot..." is the most important sentence in this chapter. It should be larger/more prominent.
- **Issue:** "Safe concurrency" is mentioned but concurrency isn't introduced until Ch 5.5. At minimum, add a forward reference.
- The `getX()` example (lines 36–42) showing that closures see the original `x = 10` even when shadowed is an important concept. Give it a proper heading.

### Ch 4.3 — Purity & Side-Effect Discipline

- The `no-run` annotation on the pure-mode example hides the most important demonstration. Consider showing the error message to make the behavior concrete.
- **Issue:** "When you run code in pure mode" — how? The API is never shown. Is it `dvala.run('...', { pure: true })`? Show the host API call.
- "File modules are always pure" — this is an important rule introduced before the bundler/file modules are explained. Readers will be confused. Add a forward reference to the missing file-modules chapter.

### Ch 4.4 — Normal vs Special Expressions

- **Recommendation: Move to an appendix or cut entirely.**
- This chapter teaches an implementation detail (how the evaluator decides whether to evaluate arguments). The reader doesn't need this mental model to write Dvala programs effectively.
- The only useful information: the list of 20 special expressions and why `if`/`&&`/`||` short-circuit. This can be a sidebar in the Control Flow chapter.
- The academic framing (McCarthy 1960, special forms) is for programming language academics, not Dvala users.

### Ch 4.5 — Tail Call Optimization via loop/recur

- Strong chapter. The best in the Design Principles section.
- The three-tier summary (for / loop/recur / self) at the end is excellent — consider making this a table at the *start* of the chapter to orient the reader.
- **Issue:** The naive `factorial` example (lines 7–12) is labeled "beautiful but dangerous" but the recursive version using `self` from Ch 2.4 uses the same pattern. Are readers supposed to never use `self` for large inputs? Be more explicit about the size threshold.
- `dropLast(xs, 1)` in the "Reverse a List" example — is `dropLast` a built-in? Verify and add it to the standard library overview.

### Ch 5.1 — Modules ✅ *improved since R1*

- **Fixed:** Module table now lists all 13 modules with import names and descriptions. The module list now matches what Getting Started describes. This is a big improvement.
- **Fixed:** The opening paragraph clarifies which functions need no import (`map`, `filter`, etc.) — a missing distinction from R1.
- **Fixed:** Cross-reference to the `assertion` module now links directly to the Testing chapter.
- `dvala list` / `dvala doc` tip at the top is excellent discoverability guidance.
- Still thin on examples per module — each module section shows 1–2 code blocks without prose explanation. Even a sentence per module about *when* to reach for it would help.
- **Still missing:** File module imports (`import("./lib/math.dvala")`) are not mentioned here — they're exclusively in Building Projects (Ch 5.7). Add a one-line forward reference: "For importing your own files, see Building Projects."
- **Still missing:** What `import` returns structurally (it's an object of functions) is implicit but never stated.

### Ch 5.2 — Effects & Handlers

- The strongest technical chapter in the book. Comprehensive, well-structured, with excellent theory grounding.
- **Issue:** It is very long. Consider splitting into:
  - "Effects Basics" (perform, handler, resume, abort, errors) — accessible chapter
  - "Advanced Handlers" (transform, shallow, multi-shot, pure state) — power users
- The comparison table (Koka / Eff / OCaml 5 / Dvala) on line 27 is excellent for positioning with experienced FP developers. Consider moving it to an appendix or the introduction so it's available earlier as a reference.
- **Issue:** The chapter says `resume` supports multi-shot (calling multiple times). The Suspension chapter (Ch 5.4) says the system uses "single-shot continuations" because multi-shot is incompatible with serialization. This apparent contradiction needs clear resolution. It seems like: *in-memory handlers* support multi-shot, but *serializable suspension* is single-shot only. Say this explicitly in both chapters.
- The `intercept-and-forward` middleware pattern is great but the example (addAuth / fetcher) is abstract. A more grounded example (logging middleware) would be more memorable.

### Ch 5.3 — Color-Free Concurrency (Implicit Async)

- Short, clear, great. The function-coloring problem is well-explained.
- **Issue:** The trampoline explanation is too brief. Many developers will want to understand the performance implications. Is there overhead? Can it handle very deep continuations?
- **Placement issue:** This chapter should come immediately before Ch 5.4 (Suspension) since they're both about async execution. Currently Ch 5.1 (Modules) and Ch 5.2 (Effects) are between them.

### Ch 5.4 — Suspension & Serializable Continuations

- The most important chapter in the book (given the product's unique value proposition). Good, but it should be longer and more prominent.
- **Issue:** "Single-shot continuations" vs Ch 5.2's multi-shot examples. See note above in Ch 5.2.
- The `RunResult` type at the end is essential. Consider showing it much earlier (maybe in Getting Started or Intro) since the host API always returns it.
- **Missing:** What happens when `resume()` is called on a stale or invalid snapshot? Error handling around the resume API.
- **Missing:** Snapshot versioning — if you upgrade Dvala, will old snapshots still work?
- **Missing:** A complete annotated example: create → suspend → store → resume → complete. The code samples are split across sections; a consolidated walkthrough would be very valuable.

### Ch 5.5 — Concurrency: parallel & race

- **Major issue:** Every example uses `no-run`. The reader cannot try anything. The chapter feels theoretical.
- The structured concurrency background (Sústrik, Trio) is good context.
- `parallel` suspending with "composite blobs" is mentioned but not explained. What does this look like? Can a parallel workflow with three branches, each potentially suspending, actually work in practice?
- The fan-out/timeout/fallback patterns are useful. They deserve runnable examples, even if simplified with local handlers.
- **Missing:** How many branches can `parallel` handle? Is there a limit? Performance characteristics?
- **Missing:** Error handling in `parallel` — if one branch throws, what happens to the others?

### Ch 5.6 — Macros

- Excellent chapter. Comprehensive, well-paced, with the right mix of theory and examples.
- The hygiene section is well-explained. The `makeAdder` example (lines 253–259) is a perfect illustration.
- The "Gotchas" section is valuable — more like this throughout the book.
- **Issue:** The `$^^{expr}` (deferred splice) is mentioned in passing but never demonstrated with an example. Show it or cut it.
- **Missing:** Can macros call other macros? Can macro expansion be recursive? Are there depth limits?
- **Missing:** How do macros interact with the module system? Can a file module export macros? (Now that Building Projects exists, this connection is more important.)
- The `@dvala.macro.expand` effect (named macro interception by host) is an advanced but powerful feature. Consider separating this into a "Host macro hooks" section to make it more discoverable.

---

### Ch 4.6 — Testing ✅ *new chapter*

This directly addresses one of the R1 critical gaps. Verdict: **excellent addition**.

- The opening argument — "pure functions are trivially testable" — is the right hook. It shows testing as a *benefit* of the design rather than a chore.
- The `assertion` module walkthrough is clean. `assertEqual`, `assertFails`, `assertFailsWith` are the right things to show.
- **Standout section:** "Testing Effectful Code" with the `silence` handler pattern is genuinely novel and one of the best things in the entire book. Many developers haven't seen this pattern and it will stick. The `fakeConfig` example is even better — extremely practical.
- The minimal test runner built from a handler is a great "aha moment" — it shows that testing infrastructure is just the language, no special magic.
- **Issue:** The chapter describes what `assert` does but never says what it does when the assertion *passes*. Does it return `null`? `true`? Clarify.
- **Issue:** The `zip` function in the `assertEqual` example (line 36) is built by hand using `map` + `range` + `count`. This is a lot of distracting code for a testing chapter. Either use `seq.zip` from the sequence module, or extract it with a "we'll define this helper" note.
- **Missing:** How do you *run* a `.test.dvala` file? The CLI command `dvala test <file>` was mentioned in Getting Started but nothing in this chapter tells the reader how to actually execute tests. At minimum: "Save your tests in a `.test.dvala` file and run `dvala test ./tests.test.dvala`."
- **Missing:** What output does the test runner produce? Does `dvala test` print pass/fail per assertion? Does it stop at the first failure? The minimal test runner example shows a pattern but the CLI runner's behavior is unaddressed.
- **Missing:** How to test functions that perform effects at both entry and exit (e.g., a function that logs on start and on completion). The examples show silencing one effect. Stacking handlers to suppress multiple effects deserves a brief example.

### Ch 5.7 — Building Projects ✅ *new chapter*

This also directly addresses an R1 critical gap. Verdict: **solid, with some gaps to fill**.

- The `dvala.json` table is clean. Empty `{}` works — good to state this upfront.
- The file layout diagram and the "library module exports its API as the last expression" pattern are clear and practical.
- The bundle internals explanation (module inlining as `let` bindings) is interesting and helps demystify what the bundler actually does.
- The TypeScript `deserializeBundle` integration is a nice touch — it's the right way to load a bundle from a host.
- `dvala run` accepting both source files and bundles (auto-detected by extension) is well explained.
- **Issue:** The chapter says `dvala build` "walks up from the current directory until it finds `dvala.json`" — but it also says you can pass an explicit directory (`dvala build ./my-project`). What if there's no `dvala.json` at all? Does it error? Does it fall back to the file on the command line?
- **Issue:** Build options table says `--no-sourcemap` reduces bundle size but doesn't say by how much. Even a rough estimate ("typically 30-50% smaller for large projects") would help users decide.
- **Missing:** Testing in the context of a project. `dvala test` is listed in the Getting Started CLI table as "Run a `.test.dvala` test file." But how does `dvala test` work inside a project? Does it pick up the `"tests"` glob from `dvala.json` automatically? Can you run `dvala test` without arguments from the project root?
- **Missing:** How do you pass `bindings` or effect handlers when running a bundle via `dvala run`? The TypeScript example shows `dvala.run(bundle)` but no `{ bindings: ... }` or `effectHandlers`. Is this possible for bundles?
- **Missing:** What happens if a file module performs a side effect at module scope (e.g., a `perform(@dvala.io.print, ...)` at the top level of a `.dvala` file)? The Purity chapter says file modules are always pure — does the bundler enforce this? What error do you get?
- **Missing:** Multi-level nesting — can you have modules that import other modules? The example only shows one level of depth. Is there a limit? Does the deduplication handle diamond imports correctly (you mention it does, but show it)?

---

## Structural Recommendations (updated)

1. **Still needed: End-to-end real-world example** — Build a complete multi-step approval workflow from scratch. Show every layer: Dvala code → host integration → suspension → storage → resume. This remains the book's biggest gap.

2. **Add a JavaScript/TypeScript Integration Guide** — Consolidate all the TypeScript API (createDvala, runAsync, resume, RunResult, Snapshot, effectHandlers patterns) in one place. Ch 5.4 (Suspension) covers host handlers but the full picture is scattered.

3. **Add a Cookbook/Recipes appendix** — Short, focused recipes: error recovery, retry logic, timeout, parallel fan-out, state threading with effects. These are the first things developers reach for.

4. **Trim or relocate "Normal vs Special Expressions"** — Still recommend moving to appendix.

5. **Promote Suspension earlier** — After the Effects chapter, add a short "Quick Suspension Preview" before diving into the full async/concurrency arc.

6. **Standardize the code example style** — Ch 5.5 (Concurrency) is still all `no-run`. The reader can't try anything. Use local synchronous handlers to demonstrate the same patterns interactively.

7. **Add a "Getting Help / Community" section** to Ch 1.2 (Getting Started) — Where do readers go when stuck?

8. **Add `dvala test` usage to the Testing chapter** — Close the loop: write assertions, run `dvala test`, see output.
