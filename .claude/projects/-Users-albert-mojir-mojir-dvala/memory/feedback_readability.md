---
name: Readability over cleverness
description: Implementation principle — favor readable, maintainable code over "smart" or clever solutions
type: feedback
---

Favor readability and maintainability over "smart" solutions.

**Why:** User's explicit guiding principle for the type system implementation (and likely all Dvala code). Clever/terse algorithms may be harder to debug, port to KMP, and maintain long-term.

**How to apply:** When implementing the type system (and any Dvala code), prefer straightforward, well-commented code over compact/clever alternatives. Choose the obvious data structure. Name things clearly. Avoid premature optimization. If a simpler algorithm is O(n²) but readable and the smart one is O(n log n) but opaque — pick the simple one unless profiling says otherwise.
