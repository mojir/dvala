---
name: quote...end syntax replaces code templates
description: Triple-backtick code templates replaced with quote...end blocks and $^{} splicing (shipped 2026-03-27)
type: project
---

Code templates migrated from triple-backtick syntax to `quote...end` with `$^{expr}` splicing.

**Why:** Backtick nesting (3, 4, 5+ backticks) was error-prone, collided with markdown, and caused syntax overlay bugs. `quote...end` is simpler, nestable without counting, and uses `$^^{expr}` for deferred splices.

**How to apply:** All macro code uses `quote...end` now. The old backtick syntax is completely removed — tokenizer, parser, tests, tutorials, examples, playground all migrated. The `CodeTemplate` token type no longer exists. `QuoteSplice` token type handles `$^{`, `$^^{`, etc.
