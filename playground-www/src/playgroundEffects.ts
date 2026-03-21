import type { ExampleEntry } from '../../src/builtin/interface'
import type { EffectReference } from '../../reference'
import type { PlaygroundAPI } from './playgroundAPI'

// Derive kebab-case effect names from PlaygroundAPI at the type level
type ToKebab<S extends string> = S extends `${infer Head}${infer Tail}`
  ? Head extends Uppercase<Head>
    ? Head extends Lowercase<Head>
      ? `${Head}${ToKebab<Tail>}`
      : `-${Lowercase<Head>}${ToKebab<Tail>}`
    : `${Head}${ToKebab<Tail>}`
  : S

type LeafPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]:
  T[K] extends (...args: never[]) => unknown
    ? `${Prefix}${ToKebab<K>}`
    : T[K] extends object
      ? LeafPaths<T[K], `${Prefix}${ToKebab<K>}.`>
      : never
}[keyof T & string]

type PlaygroundEffectName = LeafPaths<PlaygroundAPI, 'playground.'>

interface EffectDef {
  name: PlaygroundEffectName
  args: Record<string, { type: string; description: string }>
  returns: { type: string; array?: true }
  variants: { argumentNames: string[] }[]
  description: string
  group: string
  examples: ExampleEntry[]
}

// Infers literal name types via `const` and errors if any PlaygroundEffectName is missing.
// The error message includes the missing effect names.
function definePlaygroundEffects<const T extends readonly EffectDef[]>(
  effects: T & ([PlaygroundEffectName] extends [T[number]['name']] ? unknown : `Missing effects: ${Exclude<PlaygroundEffectName, T[number]['name']>}`),
): T {
  return effects
}

/**
 * Playground effect references — these effects only work inside the playground.
 * Each entry follows the same EffectReference shape as standard effects,
 * using category 'playground-effect' to distinguish them.
 */
function derivePlaygroundEffectReference(): Record<string, EffectReference> {
  const effects = definePlaygroundEffects([
    // ── UI ──
    {
      name: 'playground.ui.show-toast',
      group: 'UI',
      description: 'Show a toast notification. Rate-limited to one per 200 ms.',
      args: {
        message: { type: 'string', description: 'The message to display.' },
        level: { type: 'string', description: 'Toast level: `"info"`, `"success"`, `"warning"`, or `"error"`. Defaults to `"info"`.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['message'] }, { argumentNames: ['message', 'level'] }],
      examples: [
        { code: 'perform(@playground.ui.show-toast, "Hello!")', noRun: true },
        { code: 'perform(@playground.ui.show-toast, ["Saved!", "success"])', noRun: true },
      ],
    },
    // ── Editor ──
    {
      name: 'playground.editor.get-content',
      group: 'Editor',
      description: 'Get the current editor text.',
      args: {},
      returns: { type: 'string' },
      variants: [{ argumentNames: [] }],
      examples: [
        { code: 'let code = perform(@playground.editor.get-content)', noRun: true },
      ],
    },
    {
      name: 'playground.editor.set-content',
      group: 'Editor',
      description: 'Replace the editor content.',
      args: {
        code: { type: 'string', description: 'The new editor content.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['code'] }],
      examples: [
        { code: 'perform(@playground.editor.set-content, "1 + 2")', noRun: true },
      ],
    },
    {
      name: 'playground.editor.insert-text',
      group: 'Editor',
      description: 'Insert text at a position (defaults to cursor).',
      args: {
        text: { type: 'string', description: 'Text to insert.' },
        position: { type: 'integer', description: 'Character position to insert at. Defaults to current cursor position.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['text'] }, { argumentNames: ['text', 'position'] }],
      examples: [
        { code: 'perform(@playground.editor.insert-text, "; hello")', noRun: true },
        { code: 'perform(@playground.editor.insert-text, ["prefix ", 0])', noRun: true },
      ],
    },
    {
      name: 'playground.editor.type-text',
      group: 'Editor',
      description: 'Simulate typing into the editor character by character.',
      args: {
        text: { type: 'string', description: 'Text to type.' },
        delayMs: { type: 'integer', description: 'Delay between characters in milliseconds.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['text'] }, { argumentNames: ['text', 'delayMs'] }],
      examples: [
        { code: 'perform(@playground.editor.type-text, "Hello!")', noRun: true },
        { code: 'perform(@playground.editor.type-text, ["Hello!", 50])', noRun: true },
      ],
    },
    {
      name: 'playground.editor.get-selection',
      group: 'Editor',
      description: 'Get the currently selected text in the editor.',
      args: {},
      returns: { type: 'string' },
      variants: [{ argumentNames: [] }],
      examples: [
        { code: 'let sel = perform(@playground.editor.get-selection)', noRun: true },
      ],
    },
    {
      name: 'playground.editor.set-selection',
      group: 'Editor',
      description: 'Set the editor selection range.',
      args: {
        start: { type: 'integer', description: 'Start position of the selection.' },
        end: { type: 'integer', description: 'End position of the selection.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['start', 'end'] }],
      examples: [
        { code: 'perform(@playground.editor.set-selection, [0, 10])', noRun: true },
      ],
    },
    {
      name: 'playground.editor.get-cursor',
      group: 'Editor',
      description: 'Get the current cursor position.',
      args: {},
      returns: { type: 'integer' },
      variants: [{ argumentNames: [] }],
      examples: [
        { code: 'let pos = perform(@playground.editor.get-cursor)', noRun: true },
      ],
    },
    {
      name: 'playground.editor.set-cursor',
      group: 'Editor',
      description: 'Move the cursor to a position.',
      args: {
        position: { type: 'integer', description: 'Character position to move the cursor to.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['position'] }],
      examples: [
        { code: 'perform(@playground.editor.set-cursor, 0)', noRun: true },
      ],
    },

    // ── Context ──
    {
      name: 'playground.context.get-content',
      group: 'Context',
      description: 'Get the context panel JSON text.',
      args: {},
      returns: { type: 'string' },
      variants: [{ argumentNames: [] }],
      examples: [
        { code: 'let ctx = perform(@playground.context.get-content)', noRun: true },
      ],
    },
    {
      name: 'playground.context.set-content',
      group: 'Context',
      description: 'Replace the context panel content.',
      args: {
        json: { type: 'string', description: 'JSON text to set as the context content.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['json'] }],
      examples: [
        { code: 'perform(@playground.context.set-content, "{}")', noRun: true },
      ],
    },

    // ── Execution ──
    {
      name: 'playground.exec.run',
      group: 'Execution',
      description: 'Execute Dvala code and return the result. Times out after 10 seconds.',
      args: {
        code: { type: 'string', description: 'Dvala source code to execute.' },
      },
      returns: { type: 'any' },
      variants: [{ argumentNames: ['code'] }],
      examples: [
        { code: 'let result = perform(@playground.exec.run, "1 + 2")', noRun: true },
      ],
    },

    // ── Programs ──
    {
      name: 'playground.programs.save',
      group: 'Programs',
      description: 'Save a program. Defaults to current editor content.',
      args: {
        name: { type: 'string', description: 'Name for the saved program.' },
        code: { type: 'string', description: 'Source code to save. Defaults to current editor content.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['name'] }, { argumentNames: ['name', 'code'] }],
      examples: [
        { code: 'perform(@playground.programs.save, "my-program")', noRun: true },
        { code: 'perform(@playground.programs.save, ["hello", "1 + 2"])', noRun: true },
      ],
    },
    {
      name: 'playground.programs.load',
      group: 'Programs',
      description: 'Load a saved program by name. Fails if not found.',
      args: {
        name: { type: 'string', description: 'Name of the saved program to load.' },
      },
      returns: { type: 'string' },
      variants: [{ argumentNames: ['name'] }],
      examples: [
        { code: 'let code = perform(@playground.programs.load, "my-program")', noRun: true },
      ],
    },
    {
      name: 'playground.programs.list',
      group: 'Programs',
      description: 'List all saved program names.',
      args: {},
      returns: { type: 'string', array: true },
      variants: [{ argumentNames: [] }],
      examples: [
        { code: 'let names = perform(@playground.programs.list)', noRun: true },
      ],
    },

    // ── Router ──
    {
      name: 'playground.router.goto',
      group: 'Router',
      description: 'Navigate to a page (e.g. `"settings"`, `"examples"`, `"tutorials/effects"`).',
      args: {
        route: { type: 'string', description: 'The route to navigate to.' },
      },
      returns: { type: 'null' },
      variants: [{ argumentNames: ['route'] }],
      examples: [
        { code: 'perform(@playground.router.goto, "examples")', noRun: true },
      ],
    },
    {
      name: 'playground.router.back',
      group: 'Router',
      description: 'Navigate back in browser history.',
      args: {},
      returns: { type: 'null' },
      variants: [{ argumentNames: [] }],
      examples: [
        { code: 'perform(@playground.router.back)', noRun: true },
      ],
    },
  ])

  const result: Record<string, EffectReference> = {}
  for (const e of effects) {
    const key = `-playground-effect-${e.name}`
    const args: Record<string, { type: string; description?: string }> = {}
    for (const [argName, argDef] of Object.entries(e.args)) {
      args[argName] = { type: argDef.type, ...(argDef.description ? { description: argDef.description } : {}) }
    }
    result[key] = {
      effect: true,
      title: e.name,
      category: 'playground-effect',
      description: e.description,
      args: args as EffectReference['args'],
      returns: e.returns as EffectReference['returns'],
      variants: e.variants,
      examples: e.examples,
    }
  }
  return result
}

export const playgroundEffectReference: Record<string, EffectReference> = derivePlaygroundEffectReference()
