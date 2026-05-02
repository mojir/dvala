---
name: design
description: Use when the user asks to create a design document, plan, or architecture doc. Creates it in design/active/ with correct date-prefixed naming.
argument-hint: "<short-name>"
---

Create a new design document for "$ARGUMENTS".

## Steps

1. Create the file at `design/active/YYYY-MM-DD_$ARGUMENTS.md` using today's date
2. Use this template:

```markdown
# <Title derived from short-name>

**Status:** Draft
**Created:** YYYY-MM-DD

## Goal

<What this design aims to achieve>

---

## Background

<Context and motivation>

## Proposal

<The proposed approach>

## Open Questions

- <Question 1>

## Implementation Plan

1. <Step 1>
```

3. Open the file for the user to fill in
