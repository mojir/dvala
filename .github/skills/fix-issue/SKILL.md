---
name: fix-issue
description: Use when the user asks to fix, address, or work on a GitHub issue by number. Fetches the issue, implements a fix with tests, and verifies with the check pipeline.
argument-hint: "<issue-number>"
---

Fix GitHub issue #$ARGUMENTS in this repository.

## Steps

1. Fetch the issue details: `gh issue view $ARGUMENTS`
2. Understand the requirements and acceptance criteria
3. Explore the relevant code to understand the current behavior
4. Implement the fix
5. Add or update tests to cover the fix
6. Run `npm run check` to verify everything passes
7. Run `npm run test:e2e` to verify end-to-end tests pass
8. Summarize what was changed and why
