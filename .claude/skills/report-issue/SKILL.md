---
name: report-issue
description: Use when the user reports a bug, describes a problem, or asks to file/create a GitHub issue. Investigates the problem and creates a well-documented issue via gh.
argument-hint: "<description of the problem>"
---

Investigate the reported problem and create a GitHub issue.

Problem description: $ARGUMENTS

## Steps

1. **Investigate** the problem:
   - Search the codebase for relevant code
   - Check recent git history for related changes
   - Try to reproduce the issue (run code, tests, etc.)
   - Identify the root cause if possible

2. **Create the GitHub issue** with `gh issue create`:
   - Title: concise summary of the bug/problem
   - Body should include:
     - **Description**: what's wrong
     - **Steps to reproduce**: how to trigger the issue
     - **Expected behavior**: what should happen
     - **Actual behavior**: what happens instead
     - **Root cause** (if identified): what's going wrong in the code
     - **Relevant code**: file paths and line numbers
   - Add appropriate labels if applicable

3. **Report** the issue URL to the user
