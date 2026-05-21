# Suspend & Resume

Dvala programs can **pause mid-execution**, serialize their entire state to JSON, and **resume later** — even in a different process, on a different machine, or days later.

This is possible because the runtime uses **serializable continuations**: the call stack, local variables, and closures are all captured as plain JSON data.

```typescript
// First run — program suspends waiting for approval
const r1 = await dvala.runAsync(`
  let report = perform(@llm.complete, "Generate Q4 report");
  let approved = perform(@human.approve, report);
  if approved then "Published" else "Rejected" end
`, { effectHandlers })

// r1.type === 'suspended' — save and exit
await db.save(r1.snapshot)

// ... days later, human clicks "Approve" ...
const snapshot = await db.load()
const r2 = await resume(snapshot, true)
// r2 = { type: 'completed', value: 'Published' }
```

The program is a straight-line script. It doesn't know whether each `perform` completes instantly or suspends for days.

## Use Cases

- **Long-running workflows** — write the workflow as a normal program, not a state machine
- **Human-in-the-loop** — suspend for approval, review, or decision; resume when ready
- **Crash recovery** — save snapshots after each suspension; resume from the last one
- **AI agent orchestration** — LLM calls, tool use, and human approvals in one script
