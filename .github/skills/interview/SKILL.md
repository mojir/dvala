---
name: interview
description: Use when the user has a list of questions or decisions to work through. Walks through them one at a time, presenting options + a recommendation with confidence level for each. Triggered by `/interview`, or proactively when the user says things like "let's decide a few things", "go through these questions", or shares a list with multiple open items.
argument-hint: "[paste of questions, optional]"
---

Walk the user through a list of questions one at a time, with a recommendation on each.

## Step 1 — Find the questions

Try sources in this order:

1. **Args to the skill** — if the user passed a list of questions as `$ARGUMENTS`, use that.
2. **Recent conversation context** — design docs the user just opened (especially "Open Questions" sections), numbered lists they pasted a turn or two ago, items in a file the IDE has open.
3. **Ask** — if neither yields a clear list, ask the user what they want to decide. Don't guess.

## Step 2 — Enumerate the list (this turn)

Before presenting Q1, list ALL questions found in a short numbered overview. This lets the user confirm you have the right list, see progress as you work through it, and reorder/strike if needed.

Format:

> Found N questions to work through:
> 1. <one-line summary>
> 2. <one-line summary>
> ...
>
> Starting with #1.

If N > ~6, ask whether to work through them all sequentially or batch the easy ones — long sequential interviews can feel like a slog.

## Step 3 — Present Q1 (still this turn)

Then immediately present the first question in detail. End the turn there.

Format:

> **Q1: <question>**
>
> [Optional 1-2 sentences of context if needed.]
>
> Options:
> - **A:** <option A>
> - **B:** <option B>
> - **C:** <option C> *(if applicable)*
>
> **My rec: A.** Confidence: medium. <one-line why>

Wait for the user's answer. Don't pre-emptively ask Q2.

## Step 4 — Subsequent turns

When the user responds, acknowledge their decision in one line, then present the next question in the same format. The conversation context shows the full list — just continue from where you left off.

If the user pushes back on a recommendation or wants more detail, engage briefly, then bring it back: "Go with X, or another option?" Don't re-do the whole list.

If the user picks an option you think is wrong, say so once, briefly. Then move on — they're the decider.

## Step 5 — Finishing up

After the last question is answered, give a short numbered recap of decisions made. Then ask whether to capture them somewhere durable: commit message, design doc update, memory entry, follow-up issues. Don't write any of these without being asked.

## Style guidelines

- **Confidence levels:** `low` / `medium` / `high`, paired with a one-line reason. Don't use percentages — false precision.
- **Options:** label A/B/C/etc. Don't invent fake options to pad — two real options is fine.
- **Open-ended answers welcome.** The user might pick an option, propose a fourth, or push back entirely. All fine.
- **No explicit exit gesture.** Trust the user to interrupt or say "stop"/"pause." Don't add "type X to skip" UI.
- **One question per turn.** Resist the urge to bundle, even if Q2 looks easy.
