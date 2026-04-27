/**
 * Portable completion-item construction. Produces editor-agnostic
 * `CompletionItem` records from the builtin reference data and from
 * user-defined `SymbolDef`s. Editor adapters (VS Code, Monaco) translate
 * the portable `kind` and `insertText` fields into their host-specific
 * shapes.
 *
 * The `kind` field uses lowercase names that map 1:1 onto both
 * `vscode.CompletionItemKind` and `monaco.languages.CompletionItemKind`
 * — picking the host enum value is a single switch in the adapter.
 *
 * Snippet templates: when `params` is present, `insertText` carries the
 * snippet body with `${N:paramName}` placeholders. Adapters that don't
 * support snippets can fall back to the raw `label`.
 */

import { allReference, isFunctionReference } from '../../reference/index'
import type { Reference } from '../../reference/index'
import type { SymbolDef } from '../languageService/types'

export interface CompletionItem {
  label: string
  /**
   * Portable kind name — maps 1:1 onto both `vscode.CompletionItemKind`
   * and `monaco.languages.CompletionItemKind` via a single switch in the
   * editor adapter.
   */
  kind: 'variable' | 'function' | 'method' | 'event' | 'module' | 'class' | 'keyword' | 'operator'
  /** Free-form detail string — typically the reference category (e.g. `'effect'`) or symbol kind. */
  detail?: string
  /**
   * Snippet body when the completion should expand with placeholders.
   * Format follows the LSP/VS Code snippet syntax: `name(${1:arg1}, ${2:arg2})`.
   */
  insertText?: string
  /** Parameter names — present for callable completions, useful for signature help re-use. */
  params?: string[]
  /** Sort key — user symbols sort after builtins by default. */
  sortText?: string
}

/** Map a reference category to a portable completion kind. */
function categoryToKind(category: string): CompletionItem['kind'] {
  switch (category) {
    case 'special-expression':
      return 'keyword'
    case 'effect':
    case 'playground-effect':
      return 'event'
    case 'shorthand':
      return 'operator'
    case 'datatype':
    case 'prelude':
      return 'class'
    default:
      return 'function'
  }
}

/** Map a SymbolDef.kind to a portable completion kind. */
function symbolKindToCompletionKind(kind: SymbolDef['kind']): CompletionItem['kind'] {
  switch (kind) {
    case 'function':
      return 'function'
    case 'macro':
      return 'method'
    case 'handler':
      return 'event'
    case 'import':
      return 'module'
    case 'parameter':
    case 'variable':
      return 'variable'
  }
}

/** Build the snippet body `name(${1:arg1}, ${2:arg2})`, or `name($0)` if no args. */
function buildSnippet(name: string, argNames: string[]): string {
  if (argNames.length === 0) return `${name}($0)`
  const placeholders = argNames.map((argName, i) => `\${${i + 1}:${argName}}`).join(', ')
  return `${name}(${placeholders})`
}

/**
 * Build a completion item from a single builtin reference. Pure function;
 * rich documentation rendering belongs to the host adapter.
 */
export function referenceToCompletion(name: string, ref: Reference): CompletionItem {
  const item: CompletionItem = {
    label: name,
    kind: categoryToKind(ref.category),
    detail: ref.category,
  }
  if (isFunctionReference(ref) && ref.variants.length > 0) {
    const argNames = ref.variants[0]!.argumentNames
    item.params = argNames
    item.insertText = buildSnippet(name, argNames)
  }
  return item
}

/**
 * Build a completion item from a user-defined SymbolDef.
 *
 * Symbols sort after builtins (sortText starts with `'1_'`) so the
 * builtin set always appears first when both groups match a prefix.
 */
export function symbolDefToCompletion(def: SymbolDef): CompletionItem {
  const item: CompletionItem = {
    label: def.name,
    kind: symbolKindToCompletionKind(def.kind),
    detail: def.kind,
    sortText: `1_${def.name}`,
  }
  if (def.params && def.params.length > 0) {
    item.params = def.params
    item.insertText = buildSnippet(def.name, def.params)
  }
  return item
}

/**
 * Build the static set of builtin completions from `allReference`.
 * Deduplicates by label so the same name registered in multiple modules
 * appears only once.
 */
export function buildBuiltinCompletions(): CompletionItem[] {
  const seen = new Set<string>()
  const items: CompletionItem[] = []
  for (const ref of Object.values(allReference)) {
    if (seen.has(ref.title)) continue
    seen.add(ref.title)
    items.push(referenceToCompletion(ref.title, ref))
  }
  return items
}
