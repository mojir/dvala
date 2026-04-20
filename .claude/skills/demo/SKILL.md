---
name: demo
description: Use BEFORE committing user-facing features. Generates playground demo links and formats demo blocks for commit messages. Also use when the user asks to preview or showcase Dvala code.
argument-hint: "[dvala-code]"
---

Generate a playground demo link for the given Dvala code.

If `$ARGUMENTS` is provided, use it as the Dvala code. Otherwise, look at the current context (recent changes, editor selection) to determine what to demo.

## Steps

1. Determine the Dvala code to demo
2. Verify it runs correctly with `dvala run '<code>'`
3. Generate the playground URL:
   ```bash
   node -e "const code = '<escaped-code>'; console.log('http://localhost:22230/?state=' + btoa(encodeURIComponent(JSON.stringify({'dvala-code': code}))))"
   ```
4. Show the user the link
5. If this is for a commit, also format it as a demo block:
   ````
   ```demo
   description: <short description>
   code:
   <the dvala code>
   ```
   ````
