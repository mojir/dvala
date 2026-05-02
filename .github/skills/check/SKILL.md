---
name: check
description: Use after ANY code change to verify correctness. Runs lint, typecheck, test, build, and e2e — then fixes failures automatically. Prefer this over running npm commands manually.
---

Run the full Dvala check pipeline and fix any issues that arise.

## Steps

1. Run `npm run check` (lint + typecheck + test + build)
2. If it passes, run `npm run test:e2e`
3. If anything fails:
   - Read the error output carefully
   - Identify and fix the root cause
   - Re-run the failing step to verify the fix
   - Then re-run the full pipeline from step 1
4. Report the final result to the user
