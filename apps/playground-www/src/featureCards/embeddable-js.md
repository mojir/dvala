# Embeddable in JS

Dvala drops into any JavaScript or TypeScript application with a single function call:

```typescript
import { createDvala } from '@mojir/dvala'

const dvala = createDvala()
const result = dvala.run('1 + 2')
// result = 3
```

## Pass Values In

```typescript
const dvala = createDvala({ bindings: { x: 10, y: 20 } })
const result = dvala.run('x + y')
// result = 30
```

## Handle Effects

```typescript
const dvala = createDvala()
const result = await dvala.runAsync('perform(@my.greet, "world")', {
  effectHandlers: [{
    pattern: 'my.greet',
    handler: '({ arg, resume }) => resume(`Hello, ${arg}!`)',
  }],
})
// result = { type: 'completed', value: 'Hello, world!' }
```

## Try It

The simplest way to explore Dvala is right here in the playground. Write code in the editor and press Run:

```dvala
let greet = (name) -> `Hello, ${name}!`;
greet("world");
```
