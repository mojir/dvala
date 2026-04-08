/**
 * CST printer — reconstructs source text from a CST tree.
 *
 * Walks the tree in document order, collecting all CstToken leaf nodes
 * and concatenating their trivia + text. The result is the original source
 * (losslessness property).
 *
 * This module supports both:
 * - Full CST tree printing via `printCst(program)`
 * - Flat token-level printing via `printTokens()` in attachTrivia.ts
 */

import type {
  CstBindingTarget,
  CstNode,
  CstProgram,
  CstToken,
  TriviaNode,
} from './types'

// ---------------------------------------------------------------------------
// Token text helpers
// ---------------------------------------------------------------------------

function triviaText(trivia: TriviaNode[]): string {
  let out = ''
  for (const t of trivia) out += t.text
  return out
}

function tokenText(token: CstToken): string {
  return triviaText(token.leadingTrivia) + token.text + triviaText(token.trailingTrivia)
}

// ---------------------------------------------------------------------------
// Collector — accumulates tokens in document order
// ---------------------------------------------------------------------------

/** Collect all CstTokens from a CST tree in document order. */
function collectTokens(program: CstProgram): CstToken[] {
  const tokens: CstToken[] = []

  if (program.shebang) tokens.push(program.shebang)

  for (let i = 0; i < program.statements.length; i++) {
    collectNodeTokens(program.statements[i]!, tokens)
    if (i < program.semicolons.length) {
      tokens.push(program.semicolons[i]!)
    }
  }

  return tokens
}

function collectNodeTokens(node: CstNode, tokens: CstToken[]): void {
  switch (node.kind) {
    // -- Leaf nodes (single token) --
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'TemplateString':
    case 'RegexpShorthand':
    case 'Symbol':
    case 'EffectName':
    case 'ReservedSymbol':
      tokens.push(node.token)
      break

    // -- Collections --
    case 'Array':
      tokens.push(node.openBracket)
      for (let i = 0; i < node.elements.length; i++) {
        collectNodeTokens(node.elements[i]!, tokens)
        if (i < node.commas.length) tokens.push(node.commas[i]!)
      }
      tokens.push(node.closeBracket)
      break

    case 'Object':
      tokens.push(node.openBrace)
      for (let i = 0; i < node.entries.length; i++) {
        const entry = node.entries[i]!
        if ('kind' in entry && entry.kind === 'Spread') {
          collectNodeTokens(entry, tokens)
        } else {
          collectObjectEntryTokens(entry as Exclude<typeof entry, CstNode>, tokens)
        }
        if (i < node.commas.length) tokens.push(node.commas[i]!)
      }
      tokens.push(node.closeBrace)
      break

    // -- Operators --
    case 'BinaryOp':
      collectNodeTokens(node.left, tokens)
      tokens.push(node.operator)
      collectNodeTokens(node.right, tokens)
      break

    case 'PrefixOp':
      tokens.push(node.operator)
      collectNodeTokens(node.operand, tokens)
      break

    // -- Access and call --
    case 'PropertyAccess':
      collectNodeTokens(node.object, tokens)
      tokens.push(node.dot)
      tokens.push(node.property)
      break

    case 'IndexAccess':
      collectNodeTokens(node.object, tokens)
      tokens.push(node.openBracket)
      collectNodeTokens(node.index, tokens)
      tokens.push(node.closeBracket)
      break

    case 'Call':
      collectNodeTokens(node.fn, tokens)
      tokens.push(node.openParen)
      for (let i = 0; i < node.args.length; i++) {
        collectNodeTokens(node.args[i]!, tokens)
        if (i < node.commas.length) tokens.push(node.commas[i]!)
      }
      tokens.push(node.closeParen)
      break

    // -- Grouping --
    case 'Parenthesized':
      tokens.push(node.openParen)
      collectNodeTokens(node.expression, tokens)
      tokens.push(node.closeParen)
      break

    // -- Spread --
    case 'Spread':
      tokens.push(node.dots)
      collectNodeTokens(node.expression, tokens)
      break

    // -- Let --
    case 'Let':
      tokens.push(node.letKeyword)
      collectBindingTokens(node.target, tokens)
      tokens.push(node.equals)
      collectNodeTokens(node.value, tokens)
      break

    // -- If --
    case 'If':
      for (const branch of node.branches) {
        if (branch.elseKeyword) tokens.push(branch.elseKeyword)
        tokens.push(branch.ifKeyword)
        collectNodeTokens(branch.condition, tokens)
        tokens.push(branch.thenKeyword)
        collectBodyTokens(branch.body, branch.semicolons, tokens)
      }
      if (node.elseBranch) {
        tokens.push(node.elseBranch.elseKeyword)
        collectBodyTokens(node.elseBranch.body, node.elseBranch.semicolons, tokens)
      }
      tokens.push(node.endKeyword)
      break

    // -- Block --
    case 'Block':
      tokens.push(node.doKeyword)
      if (node.withClause) {
        tokens.push(node.withClause.withKeyword)
        collectNodeTokens(node.withClause.handler, tokens)
        tokens.push(node.withClause.semicolon)
      }
      collectBodyTokens(node.body, node.semicolons, tokens)
      tokens.push(node.endKeyword)
      break

    // -- Loop --
    case 'Loop':
      tokens.push(node.loopKeyword)
      tokens.push(node.openParen)
      for (let i = 0; i < node.bindings.length; i++) {
        const b = node.bindings[i]!
        collectBindingTokens(b.target, tokens)
        tokens.push(b.equals)
        collectNodeTokens(b.value, tokens)
        if (i < node.commas.length) tokens.push(node.commas[i]!)
      }
      tokens.push(node.closeParen)
      tokens.push(node.arrow)
      collectNodeTokens(node.body, tokens)
      break

    // -- For --
    case 'For':
      tokens.push(node.forKeyword)
      tokens.push(node.openParen)
      for (let i = 0; i < node.bindings.length; i++) {
        const b = node.bindings[i]!
        collectNodeTokens(b.target, tokens)
        tokens.push(b.inKeyword)
        collectNodeTokens(b.iterable, tokens)
        for (const lc of b.letClauses) {
          tokens.push(lc.letKeyword)
          collectNodeTokens(lc.target, tokens)
          tokens.push(lc.equals)
          collectNodeTokens(lc.value, tokens)
          tokens.push(lc.semicolon)
        }
        if (b.whenClause) {
          tokens.push(b.whenClause.whenKeyword)
          collectNodeTokens(b.whenClause.condition, tokens)
        }
        if (b.whileClause) {
          tokens.push(b.whileClause.whileKeyword)
          collectNodeTokens(b.whileClause.condition, tokens)
        }
        if (i < node.commas.length) tokens.push(node.commas[i]!)
      }
      tokens.push(node.closeParen)
      tokens.push(node.arrow)
      collectNodeTokens(node.body, tokens)
      break

    // -- Match --
    case 'Match':
      tokens.push(node.matchKeyword)
      collectNodeTokens(node.expression, tokens)
      for (const c of node.cases) {
        tokens.push(c.caseKeyword)
        collectBindingTokens(c.pattern, tokens)
        if (c.whenClause) {
          tokens.push(c.whenClause.whenKeyword)
          collectNodeTokens(c.whenClause.guard, tokens)
        }
        tokens.push(c.thenKeyword)
        collectBodyTokens(c.body, c.semicolons, tokens)
      }
      tokens.push(node.endKeyword)
      break

    // -- Function --
    case 'Function':
      if (node.openParen) tokens.push(node.openParen)
      for (let i = 0; i < node.params.length; i++) {
        collectBindingTokens(node.params[i]!, tokens)
        if (i < node.commas.length) tokens.push(node.commas[i]!)
      }
      if (node.closeParen) tokens.push(node.closeParen)
      tokens.push(node.arrow)
      collectNodeTokens(node.body, tokens)
      break

    // -- Handler --
    case 'Handler':
      if (node.shallowKeyword) tokens.push(node.shallowKeyword)
      tokens.push(node.handlerKeyword)
      for (const clause of node.clauses) {
        tokens.push(clause.effectName)
        if (clause.openParen) tokens.push(clause.openParen)
        for (let i = 0; i < clause.params.length; i++) {
          collectBindingTokens(clause.params[i]!, tokens)
          if (i < clause.commas.length) tokens.push(clause.commas[i]!)
        }
        if (clause.closeParen) tokens.push(clause.closeParen)
        tokens.push(clause.arrow)
        collectNodeTokens(clause.body, tokens)
      }
      if (node.transform) {
        tokens.push(node.transform.transformKeyword)
        collectBindingTokens(node.transform.param, tokens)
        tokens.push(node.transform.arrow)
        collectNodeTokens(node.transform.body, tokens)
      }
      tokens.push(node.endKeyword)
      break

    // -- Resume --
    case 'Resume':
      tokens.push(node.resumeKeyword)
      if (node.openParen) tokens.push(node.openParen)
      if (node.argument) collectNodeTokens(node.argument, tokens)
      if (node.closeParen) tokens.push(node.closeParen)
      break

    // -- Macro --
    case 'Macro':
      tokens.push(node.macroKeyword)
      if (node.openParen) tokens.push(node.openParen)
      for (let i = 0; i < node.params.length; i++) {
        collectBindingTokens(node.params[i]!, tokens)
        if (i < node.commas.length) tokens.push(node.commas[i]!)
      }
      if (node.closeParen) tokens.push(node.closeParen)
      tokens.push(node.arrow)
      collectNodeTokens(node.body, tokens)
      break

    case 'MacroCall':
      tokens.push(node.prefix)
      collectNodeTokens(node.argument, tokens)
      break

    // -- Quote / Splice --
    case 'Quote':
      tokens.push(node.quoteKeyword)
      collectBodyTokens(node.body, node.semicolons, tokens)
      tokens.push(node.endKeyword)
      break

    case 'Splice':
      tokens.push(node.marker)
      collectNodeTokens(node.expression, tokens)
      tokens.push(node.closeBrace)
      break
  }
}

// ---------------------------------------------------------------------------
// Helpers for compound structures
// ---------------------------------------------------------------------------

/** Collect tokens from a statement body (statements + semicolons). */
function collectBodyTokens(body: CstNode[], semicolons: CstToken[], tokens: CstToken[]): void {
  for (let i = 0; i < body.length; i++) {
    collectNodeTokens(body[i]!, tokens)
    if (i < semicolons.length) tokens.push(semicolons[i]!)
  }
}

/** Collect tokens from an object entry (key, optional colon, optional value). */
function collectObjectEntryTokens(
  entry: { openBracket?: CstToken; key: CstNode; closeBracket?: CstToken; colon?: CstToken; value?: CstNode },
  tokens: CstToken[],
): void {
  if (entry.openBracket) tokens.push(entry.openBracket)
  collectNodeTokens(entry.key, tokens)
  if (entry.closeBracket) tokens.push(entry.closeBracket)
  if (entry.colon) tokens.push(entry.colon)
  if (entry.value) collectNodeTokens(entry.value, tokens)
}

/** Collect tokens from a binding target. */
function collectBindingTokens(binding: CstBindingTarget, tokens: CstToken[]): void {
  switch (binding.kind) {
    case 'SymbolBinding':
      tokens.push(binding.name)
      if (binding.defaultClause) {
        tokens.push(binding.defaultClause.equals)
        collectNodeTokens(binding.defaultClause.value, tokens)
      }
      break

    case 'RestBinding':
      tokens.push(binding.dots)
      tokens.push(binding.name)
      break

    case 'ArrayBinding':
      tokens.push(binding.openBracket)
      for (let i = 0; i < binding.elements.length; i++) {
        const el = binding.elements[i]
        if (el) collectBindingTokens(el, tokens)
        // null elements (holes) have no tokens — commas handle the spacing
        if (i < binding.commas.length) tokens.push(binding.commas[i]!)
      }
      tokens.push(binding.closeBracket)
      if (binding.defaultClause) {
        tokens.push(binding.defaultClause.equals)
        collectNodeTokens(binding.defaultClause.value, tokens)
      }
      break

    case 'ObjectBinding':
      tokens.push(binding.openBrace)
      for (let i = 0; i < binding.entries.length; i++) {
        const entry = binding.entries[i]!
        tokens.push(entry.key)
        if (entry.asKeyword) tokens.push(entry.asKeyword)
        if (entry.alias) tokens.push(entry.alias)
        if (entry.colon) tokens.push(entry.colon)
        if (entry.target) collectBindingTokens(entry.target, tokens)
        if (i < binding.commas.length) tokens.push(binding.commas[i]!)
      }
      tokens.push(binding.closeBrace)
      if (binding.defaultClause) {
        tokens.push(binding.defaultClause.equals)
        collectNodeTokens(binding.defaultClause.value, tokens)
      }
      break

    case 'WildcardBinding':
      tokens.push(binding.token)
      break

    case 'LiteralBinding':
      collectNodeTokens(binding.value, tokens)
      break
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconstruct the original source text from a CST program.
 *
 * Walks the CST tree in document order, collecting all leaf CstTokens
 * and concatenating their trivia + text. The trailing trivia from the
 * program is appended at the end.
 *
 * Losslessness property: `printCst(parseToCst(source)) === source`
 */
export function printCst(program: CstProgram): string {
  const tokens = collectTokens(program)
  let output = ''
  for (const token of tokens) {
    output += tokenText(token)
  }
  output += triviaText(program.trailingTrivia)
  return output
}
