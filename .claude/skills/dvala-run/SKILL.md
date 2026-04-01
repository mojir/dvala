---
name: dvala-run
description: Use when the user asks to run, execute, or evaluate a Dvala code snippet. Quick REPL-like feedback without leaving the editor.
argument-hint: "<dvala-code>"
---

Run the provided Dvala code and show the result.

```bash
dvala run '$ARGUMENTS'
```

If the code fails, show the error and suggest a fix.
If no arguments are provided, check if the user has code selected in the editor and run that instead.
