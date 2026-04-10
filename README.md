# Dvala

A suspendable runtime with algebraic effects.

[![npm](https://img.shields.io/npm/v/@mojir/dvala)](https://www.npmjs.com/package/@mojir/dvala)
[![CI](https://github.com/mojir/dvala/actions/workflows/ci.yml/badge.svg)](https://github.com/mojir/dvala/actions/workflows/ci.yml)

Dvala is an expression-based language with a TypeScript runtime where every side effect flows through algebraic effects. The entire execution state -- including closures, call stacks, and handler chains -- is serializable to JSON and resumable across processes, machines, and time.

[Try it in the Playground](https://mojir.github.io/dvala/) | [The Book](https://mojir.github.io/dvala/#/book) | [Reference](https://mojir.github.io/dvala/#/ref) | [Examples](https://mojir.github.io/dvala/#/examples)

---

## Algebraic Effects

Every interaction with the outside world goes through `perform`. The host decides what happens -- resume with a value, suspend, or fail. Effects are first-class, composable, and testable.

```dvala no-run
// Dvala code performs effects -- it never does I/O directly
let name = perform(@dvala.io.read, "What's your name? ");
perform(@dvala.io.print, `Hello, ${name}!`);
```

```typescript
// The TypeScript host controls what each effect does
const dvala = createDvala()
const result = await dvala.runAsync(source, {
  effectHandlers: [
    { pattern: 'dvala.io.read', handler: async ({ arg, resume }) => {
      const answer = await readline.question(arg)
      resume(answer)
    }},
    { pattern: 'dvala.io.print', handler: ({ arg, resume }) => {
      console.log(arg)
      resume(arg)
    }},
  ]
})
```

Dvala programs are pure -- they describe *what* to do, while the host decides *how*. This makes programs sandboxed by default, trivially testable (swap handlers), and portable across environments.

## Suspendable & Serializable

When a program performs an effect, the host can **suspend** it. The entire execution state freezes to JSON -- closures, call stack, handler chain, everything. Resume it later, on a different machine, days from now.

```typescript
// A workflow that needs human approval
const result = await dvala.runAsync(`
  let data = perform(@gather.data);
  let approved = perform(@human.approve, data);
  if approved then perform(@execute.action, data) end
`, { effectHandlers: handlers })

if (result.type === 'suspended') {
  // Save to database -- it's just JSON
  await db.save(result.snapshot)
}

// Days later, on a different server...
const snapshot = await db.load(id)
const final = await resume(snapshot, true)  // human approved
```

This powers long-running workflows, human-in-the-loop AI agents, approval chains, and anything that needs to pause and resume across boundaries.

## Time Travel

Every effect automatically captures a snapshot. Step backward through execution, explore alternate paths, rewind and replay.

```typescript
const result = await dvala.runAsync(code, {
  effectHandlers: handlers,
  // Snapshots are captured automatically at each effect boundary
})

if (result.type === 'completed' && result.snapshot) {
  // The terminal snapshot contains the full checkpoint history
  const checkpoints = result.snapshot.checkpoints

  // Jump back to any checkpoint and resume with a different value
  const alternate = await resume(checkpoints[2], differentValue)
}
```

The [Playground](https://mojir.github.io/dvala/) has a built-in snapshot viewer -- click any snapshot to see the execution state and resume from that point.

## Quick Start

### Install

```bash
npm install @mojir/dvala
```

### Use as a library

```typescript
import { createDvala } from '@mojir/dvala'

const dvala = createDvala()

// Synchronous evaluation
dvala.run('1 + 2')  // => 3

// With effects
const result = await dvala.runAsync('perform(@dvala.io.print, "hello")', {
  effectHandlers: [
    { pattern: 'dvala.io.print', handler: ({ arg, resume }) => {
      console.log(arg)
      resume(arg)
    }}
  ]
})
```

### Use as a CLI

```bash
npm install --global @mojir/dvala

# Start a REPL
dvala

# Evaluate an expression
dvala eval "map([1, 2, 3], -> $ * 2)"

# Run a file
dvala run script.dvala

# Run tests
dvala test tests.test.dvala
```

## Links

- [Playground](https://mojir.github.io/dvala/) -- interactive editor with live execution, snapshots, and reference docs
- [The Book](https://mojir.github.io/dvala/#/book) -- comprehensive language guide
- [Reference](https://mojir.github.io/dvala/#/ref) -- all functions, effects, and datatypes
- [Examples](https://mojir.github.io/dvala/#/examples) -- runnable examples with effect handlers
- [npm](https://www.npmjs.com/package/@mojir/dvala)
- [GitHub](https://github.com/mojir/dvala)

## License

ISC
