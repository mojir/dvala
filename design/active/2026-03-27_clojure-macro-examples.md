# Clojure Macro Examples → Dvala (Nested)

**Status:** Draft
**Created:** 2026-03-27

## Goal

Add examples to `reference/examples.ts` that demonstrate **nested macros** (macro generating macro) — inspired by Clojure/Lisp patterns, translated to Dvala's `quote...end` with `$^^{}` splicing.

---

## Reality Check

Genuinely nested macro examples are rare even in Clojure. The canonical patterns:

1. **`deftemplate`** (from `clojure.tools.macro`) — a macro factory that emits `defmacro` forms
2. **`define-for`** (Scheme) — `define-syntax` that emits another `define-syntax`
3. **Operator family generators** — macro that creates a family of related macros

Most "practical" Clojure macros are single-level. The nested case is a power-user feature.

---

## Selected Examples

### 1. `makeBinOp` — operator macro factory

**Clojure inspiration** (composite of common patterns):
```clojure
;; A macro that generates binary operator macros
(defmacro def-binop [name op]
  `(defmacro ~name [a# b#]
     `(~'~op ~~a# ~~b#)))

(def-binop my-add +)
(def-binop my-mul *)
(my-add 3 4)   ;; => 7
(my-mul 3 4)   ;; => 12
```

**Dvala:**
```dvala
// A macro that creates a new macro applying a binary operation
let makeBinOp = macro (op) ->
  quote
    macro (a, b) -> quote $^{a} $^^{op} $^{b} end
  end;

let myAdd = makeBinOp(+);
let myMul = makeBinOp(*);
myAdd(3, 4);    // → 7
myMul(3, 4)     // → 12
```

`$^^{op}` escapes two levels: the `op` AST is captured by the outer quote and spliced into the inner quote's expansion.

---

### 2. `makeWrapper` — macro that generates a "wrap expression in handler" macro

**Clojure inspiration:**
```clojure
;; A macro factory that wraps expressions in a try-catch with a specific handler
(defmacro def-safe [name handler-fn]
  `(defmacro ~name [body#]
     `(try ~~body#
        (catch Exception e# (~'~handler-fn e#)))))

(def-safe safe-div (fn [e] 0))
(safe-div (/ 10 0))   ;; => 0
```

**Dvala:**
```dvala
// A macro that creates a "safe" wrapper with a custom fallback value
let makeSafe = macro (fallbackVal) ->
  quote
    macro (ast) -> quote ($^{ast}) ||> fallback($^^{fallbackVal}) end
  end;

let { fallback } = import(effectHandler);

let safeMath = makeSafe(0);
let safeStr = makeSafe("error");

safeMath(0 / 0);                  // → 0
safeStr(get(null, "missing"))     // → "error"
```

`$^^{fallbackVal}` — the fallback value is captured at the outer quote level and injected into the inner quote.

---

### 3. `makeApplier` — macro that wraps a function as a macro

**Clojure inspiration:**
```clojure
;; Turn any function into a macro (apply it at expansion time)
(defmacro def-applier [name f]
  `(defmacro ~name [x#]
     `(~'~f ~~x#)))

(def-applier doubler (fn [x] (* x 2)))
(doubler 21)   ;; => 42
```

**Dvala:**
```dvala
// A macro that wraps a function call as a macro
let makeApplier = macro (fn) ->
  quote
    macro (ast) -> quote $^^{fn}($^{ast}) end
  end;

let doubleIt = makeApplier((x) -> x * 2);
let stringify = makeApplier(str);

doubleIt(21);       // → 42
stringify(1 + 2)    // → "3"
```

---

## Implementation Plan

1. Add each as a separate example in `reference/examples.ts`
2. Each shows the Clojure original (commented) and Dvala translation
3. Verify via `dvala eval`
4. Run `/check`
