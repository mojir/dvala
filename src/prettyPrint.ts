/**
 * Smart AST pretty printer.
 *
 * Converts Dvala AST nodes (arrays) to readable source code.
 * Chooses idiomatic syntax regardless of how the AST was constructed.
 * Wraps lines at 80 columns (hard for structure, soft for atoms).
 *
 * Exposed as:
 * - TS function: `prettyPrint(node)` — for playground and tooling
 * - Dvala function: `let { prettyPrint } = import("ast")` — for in-language use
 */

import { MAX_INLINE_ENTRIES, MAX_WIDTH } from './formatter/config'

const INDENT_SIZE = 2

const NodeTypes = {
  Num: 'Num',
  Str: 'Str',
  Call: 'Call',
  Sym: 'Sym',
  Builtin: 'Builtin',
  Special: 'Special',
  Reserved: 'Reserved',
  Spread: 'Spread',
  TmplStr: 'TmplStr',
  If: 'If',
  Block: 'Block',
  Effect: 'Effect',
  Recur: 'Recur',
  Array: 'Array',
  Parallel: 'Parallel',
  Race: 'Race',
  Perform: 'Perform',
  Object: 'Object',
  Function: 'Function',
  Let: 'Let',
  And: 'And',
  Or: 'Or',
  Qq: 'Qq',
  Loop: 'Loop',
  For: 'For',
  Match: 'Match',
  Import: 'Import',
  Macro: 'Macro',
  Handler: 'Handler',
  Resume: 'Resume',
  WithHandler: 'WithHandler',
  CodeTmpl: 'CodeTmpl',
  Splice: 'Splice',
  MacroCall: 'MacroCall',
} as const

type AstNode = [string, unknown, number]

let blankLinesBeforeNodeId = new Map<number, number>()

export function withPrettyPrintBlankLineHints<T>(hints: Map<number, number>, fn: () => T): T {
  const previousHints = blankLinesBeforeNodeId
  blankLinesBeforeNodeId = hints
  try {
    return fn()
  } finally {
    blankLinesBeforeNodeId = previousHints
  }
}

// Infix binary operators rendered as `a op b`
const infixOperators = new Set([
  '+', '-', '*', '/', '^', '%', '==', '!=',
  '<', '>', '<=', '>=', '++',
  '&', '|', 'xor', '<<', '>>', '>>>',
])

// Operator precedence (higher number = tighter binding).
// Mirrors src/parser/getPrecedence.ts — only the operators that reach
// printCall as Call(Builtin, ...) are relevant here; `&&`, `||`, `??`
// and `|>` are represented as separate AST node types so they cannot
// appear in printArg, but are included for completeness.
const operatorPrecedence: Record<string, number> = {
  '|>': 2,
  '&&': 4, '||': 4, '??': 4,
  '&': 5, '|': 5, 'xor': 5,
  '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7,
  '++': 8,
  '<<': 9, '>>': 9, '>>>': 9,
  '+': 10, '-': 10,
  '*': 11, '/': 11, '%': 11,
  '^': 12,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indent(level: number): string {
  return ' '.repeat(level * INDENT_SIZE)
}

/** Check if a single-line rendering fits within the max width. */
function fits(text: string, currentIndent: number): boolean {
  return currentIndent * INDENT_SIZE + text.length <= MAX_WIDTH
}

/**
 * Returns true when every string is single-line (no embedded newlines).
 * Used to guard flat-form attempts: a flat string containing `\n` would
 * produce broken indentation even when its total character count fits.
 */
function allSingleLine(...strs: string[]): boolean {
  return strs.every(s => !s.includes('\n'))
}

function getBlankLinesBefore(nodeId: number): number {
  return blankLinesBeforeNodeId.get(nodeId) ?? 0
}

function formatStatementLines(nodeIds: number[], lines: string[]): string {
  let body = ''

  lines.forEach((line, index) => {
    if (index > 0) {
      body += ';\n'
      const blankLines = getBlankLinesBefore(nodeIds[index]!)
      if (blankLines > 0)
        body += '\n'.repeat(blankLines)
    }
    body += line
  })

  return `${body};`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Convert an AST node to readable Dvala source. */
export function prettyPrint(node: unknown): string {
  return printNode(node as AstNode, 0, true)
}

// ---------------------------------------------------------------------------
// Node printing — each function tries flat first, breaks if too wide
// ---------------------------------------------------------------------------

/**
 * @param isRoot  True when this expression occupies its own "slot" — i.e. it
 *   is either the top-level expression or a direct child of a do-block / function
 *   body.  MacroCall uses this to decide whether to apply decorator-style
 *   formatting (`#foo` on its own line, operand at the same indent).
 */
function printNode(node: AstNode, ind: number, isRoot = false): string {
  const [type, payload] = node

  switch (type) {
    case NodeTypes.Num:
      return String(payload)
    case NodeTypes.Str:
      // Escape backslash first, then special characters, then double-quote.
      return `"${String(payload)
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/"/g, '\\"')
      }"`
    case NodeTypes.Reserved:
      return String(payload)
    case NodeTypes.Sym:
      return String(payload)
    case NodeTypes.Builtin:
      return String(payload)
    case NodeTypes.Effect:
      return `@${payload}`
    case NodeTypes.Call:
      return printCall(payload as [unknown[], unknown[]], ind)
    case NodeTypes.MacroCall: {
      // `#macro expr` always has exactly one operand (the expression passed as unevaluated AST).
      const [fnNode, args] = payload as [AstNode, AstNode[]]
      const macroStr = `#${printNode(fnNode, ind)}`
      const operand = args[0]!
      // Decorator style: when this is a root expression and the operand is a Let
      // or another MacroCall (chained decorators), put #macro alone on its line
      // with the operand at the same indent level (sibling, not child).
      if (isRoot && (operand[0] === NodeTypes.Let || operand[0] === NodeTypes.MacroCall)) {
        return `${macroStr}\n${indent(ind)}${printNode(operand, ind, true)}`
      }
      // Otherwise: flat if fits, operand indented on next line if not
      const operandStr = printNode(operand, ind)
      if (allSingleLine(operandStr)) {
        const flat = `${macroStr} ${operandStr}`
        if (fits(flat, ind)) return flat
      }
      return `${macroStr}\n${indent(ind + 1)}${printNode(operand, ind + 1)}`
    }
    case NodeTypes.If:
      return printIf(payload as unknown[][], ind)
    case NodeTypes.Block:
      return printBlock(payload as unknown[][], ind)
    case NodeTypes.Let:
      return printLet(payload as [unknown[], unknown[]], ind)
    case NodeTypes.Function:
      return printFunction(payload as [unknown[][], unknown[][]], ind)
    case NodeTypes.Macro:
      return printMacro(payload as [unknown[][], unknown[][], string | null], ind)
    case NodeTypes.Perform:
      return printPerform(payload as [unknown[], unknown[] | undefined], ind)
    case NodeTypes.Array:
      return printArray(payload as unknown[][], ind)
    case NodeTypes.Object:
      return printObject(payload as unknown[][], ind)
    case NodeTypes.Spread:
      return `...${printNode(payload as AstNode, ind)}`
    case NodeTypes.And:
      return printBinaryChain(payload as unknown[][], '&&', ind)
    case NodeTypes.Or:
      return printBinaryChain(payload as unknown[][], '||', ind)
    case NodeTypes.Qq:
      return printBinaryChain(payload as unknown[][], '??', ind)
    case NodeTypes.Recur:
      return printCommaSeparated('recur', payload as unknown[][], ind)
    case NodeTypes.Loop:
      return printLoop(payload as [unknown[][], unknown[]], ind)
    case NodeTypes.For:
      return printFor(payload as [unknown[][], unknown[]], ind)
    case NodeTypes.Match:
      return printMatch(payload as [unknown[], unknown[][]], ind)
    case NodeTypes.Import:
      return `import("${payload}")`
    case NodeTypes.TmplStr:
      return printTemplateString(payload as unknown[][])
    case NodeTypes.Parallel:
      return printCommaSeparated('parallel', payload as unknown[][], ind)
    case NodeTypes.Race:
      return printCommaSeparated('race', payload as unknown[][], ind)
    case NodeTypes.CodeTmpl:
      return printCodeTemplate(payload as [unknown[][], unknown[][]], ind)
    case NodeTypes.Splice:
      return '<Splice>'
    case NodeTypes.Handler:
      return printHandler(payload as [unknown[], unknown], ind)
    case NodeTypes.Resume:
      return payload === 'ref' ? 'resume' : `resume(${printNode(payload as AstNode, ind)})`
    case NodeTypes.WithHandler: {
      const [handlerExpr, bodyExprs] = payload as [unknown[], unknown[][]]
      // `with h;` is always on its own line — a flat form would put semicolons
      // mid-line, violating the semicolons-last-on-line rule.
      // Body statements sit at the same indent as `with` itself (siblings in
      // the enclosing do block, not children of `with`).
      const handlerStr = printNode(handlerExpr as AstNode, ind)
      const bodyStrs = bodyExprs.map(b => printNode(b as AstNode, ind))
      return `with ${handlerStr};\n${bodyStrs.map(s => `${indent(ind)}${s}`).join(';\n')}`
    }
    // Binding target types (from destructuring patterns, not evaluable code)
    case 'symbol':
    case 'rest':
    case 'array':
    case 'object':
    case 'wildcard':
    case 'literal':
      return printBindingTarget(node)
    default:
      return `<${type}>`
  }
}

// ---------------------------------------------------------------------------
// Compound node printers
// ---------------------------------------------------------------------------

function printCall(payload: [unknown[], unknown[], unknown?], ind: number): string {
  const [fn, args, rawHints] = payload
  const fnNode = fn as AstNode
  const argNodes = args as AstNode[]
  const hints = rawHints as { isInfix?: boolean; isPipe?: boolean } | undefined

  // Smart rewrite: unary minus — 0 - x → -x
  if (fnNode[0] === NodeTypes.Builtin && fnNode[1] === '-' && argNodes.length === 2) {
    const first = argNodes[0]!
    if (first[0] === NodeTypes.Num && first[1] === 0) {
      return `-${printNode(argNodes[1]!, ind)}`
    }
  }

  // Smart rewrite: dot access — get(obj, "key") → obj.key
  if (fnNode[0] === NodeTypes.Builtin && fnNode[1] === 'get' && argNodes.length === 2) {
    const keyNode = argNodes[1]!
    if (keyNode[0] === NodeTypes.Str && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(keyNode[1] as string)) {
      return `${printNode(argNodes[0]!, ind)}.${keyNode[1]}`
    }
  }

  // Pipe chain — only when authored with |> (isPipe hint).
  // Without the hint, f(g(h(x))) stays as nested calls — preserves authorial intent.
  if (hints?.isPipe) {
    const pipeChain = extractPipeChain(fnNode, argNodes)
    if (pipeChain) {
      const flatParts = pipeChain.map(n => printNode(n, ind))
      if (allSingleLine(...flatParts)) {
        const flat = flatParts.join(' |> ')
        if (fits(flat, ind)) return flat
      }
      // Multi-line pipe: each segment on its own line with |> prefix
      const parts = pipeChain.map(n => printNode(n, ind + 1))
      return `${parts[0]!}\n${parts.slice(1).map(p => `${indent(ind + 1)}|> ${p}`).join('\n')}`
    }
  }

  // Infix binary operators: a + b
  // Skip infix if either arg is a placeholder _ (partial application)
  const hasPlaceholder = argNodes.some(a => a[0] === NodeTypes.Reserved && a[1] === '_')
  if (fnNode[0] === NodeTypes.Builtin && argNodes.length === 2 && !hasPlaceholder) {
    const op = fnNode[1] as string
    if (infixOperators.has(op)) {
      const outerPrec = operatorPrecedence[op] ?? 0
      // Add parens around an infix sub-expression whose operator binds looser
      // than the outer one (e.g. `(x - avg) ^ 2` must stay parenthesised).
      const printArg = (argNode: AstNode, isRight: boolean): string => {
        const str = printNode(argNode, ind)
        // Only check binary infix calls (2 args, builtin operator in infixOperators)
        if (argNode[0] === NodeTypes.Call) {
          const callPayload = argNode[1] as [AstNode, AstNode[]]
          const innerFn = callPayload[0]
          const innerArgs = callPayload[1]
          if (
            innerFn[0] === NodeTypes.Builtin
            && innerArgs.length === 2
            && infixOperators.has(innerFn[1] as string)
          ) {
            const innerOp = innerFn[1] as string
            const innerPrec = operatorPrecedence[innerOp] ?? 0
            // Parens needed when inner binds looser, or same precedence on right side
            // (handles right-assoc `^` correctly: `a ^ (b ^ c)` vs `(a ^ b) ^ c`).
            if (innerPrec < outerPrec || (isRight && innerPrec === outerPrec)) {
              return `(${str})`
            }
          }
        }
        return str
      }
      return `${printArg(argNodes[0]!, false)} ${op} ${printArg(argNodes[1]!, true)}`
    }
  }

  // User-defined infix call: a foo b (authored as infix, preserved via isInfix hint)
  if (hints?.isInfix && fnNode[0] === NodeTypes.Sym && argNodes.length === 2) {
    const leftStr = printNode(argNodes[0]!, ind)
    const rightStr = printNode(argNodes[1]!, ind)
    if (allSingleLine(leftStr, rightStr)) {
      const flat = `${leftStr} ${fnNode[1] as string} ${rightStr}`
      if (fits(flat, ind)) return flat
    }
    // Multi-line: operator as prefix on the continuation line
    return `${leftStr}\n${indent(ind + 1)}${fnNode[1] as string} ${printNode(argNodes[1]!, ind + 1)}`
  }

  // Regular function call — wrap callee in parens if it's a complex expression (lambda, etc.)
  const rawFnStr = printNode(fnNode, ind)
  const needsParens = fnNode[0] === NodeTypes.Function || fnNode[0] === NodeTypes.Macro
  const fnStr = needsParens ? `(${rawFnStr})` : rawFnStr
  const argStrs = argNodes.map(a => printNode(a, ind))
  if (allSingleLine(rawFnStr, ...argStrs)) {
    const flat = `${fnStr}(${argStrs.join(', ')})`
    if (fits(flat, ind)) return flat
  }

  // Trailing lambda: when the last arg is a `-> do...end` block, keep all
  // leading args on the opening line and let the block hang at the call's
  // indent level — mirrors the `f("desc", -> do ... end)` convention common
  // in test frameworks and avoids the awkward exploded-args form.
  const lastArg = argNodes.at(-1)
  if (argNodes.length >= 2 && lastArg![0] === NodeTypes.Function) {
    const leadingArgStrs = argNodes.slice(0, -1).map(a => printNode(a, ind))
    if (allSingleLine(...leadingArgStrs)) {
      // Render the lambda at the call's own indent so `end` aligns with the call.
      const lambdaStr = printNode(lastArg!, ind)
      // Only use trailing form for `-> do...end` blocks (multi-line with `end` closer).
      // Single-expression lambdas (`->`) fall through to the standard exploded form.
      if (!allSingleLine(lambdaStr) && lambdaStr.endsWith(`${indent(ind)}end`)) {
        const cutAt = lambdaStr.indexOf('\n')
        const openingLine = `${fnStr}(${leadingArgStrs.join(', ')}, ${lambdaStr.slice(0, cutAt)}`
        if (fits(openingLine, ind)) {
          return `${openingLine}${lambdaStr.slice(cutAt)})`
        }
      }
    }
  }

  // Multi-line args
  const argsStr = argNodes.map(a => `${indent(ind + 1)}${printNode(a, ind + 1)}`).join(',\n')
  return `${fnStr}(\n${argsStr},\n${indent(ind)})`
}

function printIf(parts: unknown[][], ind: number): string {
  const cond = printNode(parts[0] as AstNode, ind)
  const thenNode = parts[1] as AstNode
  const elseNode = parts.length > 2 && parts[2] ? parts[2] as AstNode : null

  // Else-if chain: when else branch is another If, emit "else if ..." without extra "end"
  const isElseIf = elseNode && (elseNode)[0] === NodeTypes.If

  // Try flat — only when all components are single-line
  const thenStr = printNode(thenNode, ind)
  if (elseNode) {
    const elseStr = isElseIf
      ? printIf((elseNode)[1] as unknown[][], ind)
      : printNode(elseNode, ind)
    if (allSingleLine(cond, thenStr, elseStr)) {
      const flat = isElseIf
        ? `if ${cond} then ${thenStr} else ${elseStr}`
        : `if ${cond} then ${thenStr} else ${elseStr} end`
      if (fits(flat, ind)) return flat
    }
  } else {
    if (allSingleLine(cond, thenStr)) {
      const flat = `if ${cond} then ${thenStr} end`
      if (fits(flat, ind)) return flat
    }
  }

  // Multi-line
  const thenMulti = printNode(thenNode, ind + 1)
  if (elseNode) {
    if (isElseIf) {
      // else if — keep same indent, no extra end
      const elseIfStr = printIf((elseNode)[1] as unknown[][], ind)
      return `if ${cond} then\n${indent(ind + 1)}${thenMulti}\n${indent(ind)}else ${elseIfStr}`
    }
    const elseMulti = printNode(elseNode, ind + 1)
    return `if ${cond} then\n${indent(ind + 1)}${thenMulti}\n${indent(ind)}else\n${indent(ind + 1)}${elseMulti}\n${indent(ind)}end`
  }
  return `if ${cond} then\n${indent(ind + 1)}${thenMulti}\n${indent(ind)}end`
}

function printBlock(stmts: unknown[][], ind: number): string {
  // Single statement: try flat (no semicolons needed, only when single-line)
  if (stmts.length === 1) {
    const stmt = printNode(stmts[0] as AstNode, ind)
    if (allSingleLine(stmt)) {
      const flat = `do ${stmt} end`
      if (fits(flat, ind)) return flat
    }
  }
  // Multiple statements (or single that doesn't fit): always expand.
  // Semicolons appear as the last token on each line (never mid-line).
  const lines = stmts.map(s => `${indent(ind + 1)}${printNode(s as AstNode, ind + 1, true)}`)
  return `do\n${formatStatementLines(stmts.map(s => (s as AstNode)[2]), lines)}\n${indent(ind)}end`
}

function printLet(payload: [unknown[], unknown[]], ind: number): string {
  const [target, value] = payload
  const prefix = `let ${printBindingTarget(target)} = `
  const valueStr = printNode(value as AstNode, ind)
  // If the value is single-line but `let name = value` still exceeds the width,
  // break after `=` and re-render the value at a deeper indent.
  if (allSingleLine(valueStr) && !fits(`${prefix}${valueStr}`, ind)) {
    return `${prefix}\n${indent(ind + 1)}${printNode(value as AstNode, ind + 1)}`
  }
  return `${prefix}${valueStr}`
}

function printFunction(payload: [unknown[][], unknown[][], unknown?], ind: number): string {
  const [params, body, rawHints] = payload
  const hints = rawHints as { isShorthand?: boolean } | undefined

  // Shorthand lambda: authored as `-> expr` with no explicit params.
  // Preserve the form so the formatter does not add ($) prefix.
  if (hints?.isShorthand) {
    if (body.length === 1 && (body[0] as AstNode)[0] !== NodeTypes.WithHandler) {
      const bodyStr = printNode(body[0] as AstNode, ind)
      if (allSingleLine(bodyStr)) {
        const flat = `-> ${bodyStr}`
        if (fits(flat, ind)) return flat
      }
      return `->\n${indent(ind + 1)}${printNode(body[0] as AstNode, ind + 1)}`
    }
    // Multi-statement or WithHandler body: always expand (no mid-line semicolons)
    const lines = body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1, true)}`)
    return `-> do\n${formatStatementLines(body.map(b => (b as AstNode)[2]), lines)}\n${indent(ind)}end`
  }

  const paramStr = params.map(p => printBindingTarget(p)).join(', ')

  if (body.length === 1) {
    // `with handler...end; body` is NOT a valid standalone expression — it can
    // only appear inside a `do...end` block. Wrap it in do...end when it's a
    // single-body function, treating it like a multi-statement body.
    if ((body[0] as AstNode)[0] !== NodeTypes.WithHandler) {
      const bodyStr = printNode(body[0] as AstNode, ind)
      if (allSingleLine(bodyStr)) {
        const flat = `(${paramStr}) -> ${bodyStr}`
        if (fits(flat, ind)) return flat
      }
      // Break body to next line
      return `(${paramStr}) ->\n${indent(ind + 1)}${printNode(body[0] as AstNode, ind + 1)}`
    }
  }

  // Multi-statement body (or single WithHandler): always expand (no mid-line semicolons)
  const lines = body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1, true)}`)
  return `(${paramStr}) -> do\n${formatStatementLines(body.map(b => (b as AstNode)[2]), lines)}\n${indent(ind)}end`
}

function printMacro(payload: [unknown[][], unknown[][], string | null], ind: number): string {
  const [params, body, qualifiedName] = payload
  const paramStr = params.map(p => printBindingTarget(p)).join(', ')
  const namePrefix = qualifiedName ? `macro@${qualifiedName}` : 'macro'

  if (body.length === 1 && (body[0] as AstNode)[0] !== NodeTypes.WithHandler) {
    const bodyStr = printNode(body[0] as AstNode, ind)
    if (allSingleLine(bodyStr)) {
      const flat = `${namePrefix} (${paramStr}) -> ${bodyStr}`
      if (fits(flat, ind)) return flat
    }
    return `${namePrefix} (${paramStr}) ->\n${indent(ind + 1)}${printNode(body[0] as AstNode, ind + 1)}`
  }

  // Multi-statement body (or single WithHandler): always expand (no mid-line semicolons)
  const lines = body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1, true)}`)
  return `${namePrefix} (${paramStr}) -> do\n${formatStatementLines(body.map(b => (b as AstNode)[2]), lines)}\n${indent(ind)}end`
}

function printPerform(payload: [unknown[], unknown[] | undefined], ind: number): string {
  const [eff, arg] = payload
  const effStr = printNode(eff as AstNode, ind)
  if (arg) {
    const argStr = printNode(arg as AstNode, ind)
    if (allSingleLine(effStr, argStr)) {
      const flat = `perform(${effStr}, ${argStr})`
      if (fits(flat, ind)) return flat
    }
    // Multi-line: break arg to its own indented line
    return `perform(\n${indent(ind + 1)}${effStr},\n${indent(ind + 1)}${printNode(arg as AstNode, ind + 1)},\n${indent(ind)})`
  }
  return `perform(${effStr})`
}

function printArray(elements: unknown[][], ind: number): string {
  if (elements.length === 0) return '[]'

  // Try flat only when element count is within the inline limit and no element
  // produces multi-line output. A multi-line element embedded in a flat array
  // produces broken indentation even when total character count fits.
  if (elements.length <= MAX_INLINE_ENTRIES) {
    const flatParts = elements.map(e => printNode(e as AstNode, ind))
    if (flatParts.every(p => !p.includes('\n'))) {
      const flat = `[${flatParts.join(', ')}]`
      if (fits(flat, ind)) return flat
    }
  }

  let body = ''
  elements.forEach((element, index) => {
    if (index > 0) {
      body += ',\n'
      const blankLines = getBlankLinesBefore((element as AstNode)[2])
      if (blankLines > 0)
        body += '\n'.repeat(blankLines)
    }
    body += `${indent(ind + 1)}${printNode(element as AstNode, ind + 1)}`
  })
  return `[\n${body},\n${indent(ind)}]`
}

function printObject(entries: unknown[][], ind: number): string {
  if (entries.length === 0) return '{}'

  // Try flat only when entry count is within the inline limit and all values are single-line
  if (entries.length <= MAX_INLINE_ENTRIES) {
    const flatParts = entries.map(entry => formatObjectEntry(entry, ind))
    if (allSingleLine(...flatParts)) {
      const flat = `{ ${flatParts.join(', ')} }`
      if (fits(flat, ind)) return flat
    }
  }

  // Multi-line — reformat at deeper indent
  let body = ''
  entries.forEach((entry, index) => {
    if (index > 0) {
      body += ',\n'
      const blankLines = getBlankLinesBefore(getObjectEntryNodeId(entry))
      if (blankLines > 0)
        body += '\n'.repeat(blankLines)
    }
    body += `${indent(ind + 1)}${formatObjectEntry(entry, ind + 1)}`
  })
  return `{\n${body},\n${indent(ind)}}`
}

function getObjectEntryNodeId(entry: unknown[]): number {
  if (entry[0] === NodeTypes.Spread)
    return (entry as AstNode)[2]

  return (entry[0] as AstNode)[2]
}

function formatObjectEntry(entry: unknown[], ind: number): string {
  if (entry[0] === NodeTypes.Spread) {
    return `...${printNode(entry[1] as AstNode, ind)}`
  }
  const [keyNode, valueNode] = entry as [AstNode, AstNode]
  if (keyNode[0] === NodeTypes.Str) {
    const key = keyNode[1] as string
    const isIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
    // Shorthand: { x: x } → { x } when key and value are the same identifier.
    if (isIdentifier && valueNode[0] === NodeTypes.Sym && valueNode[1] === key) {
      return key
    }
    // Non-identifier keys (e.g. "|>") must stay quoted to remain valid syntax.
    const quotedKey = isIdentifier ? key : `"${key}"`
    return `${quotedKey}: ${printNode(valueNode, ind)}`
  }
  return `[${printNode(keyNode, ind)}]: ${printNode(valueNode, ind)}`
}

function printBinaryChain(nodes: unknown[][], op: string, ind: number): string {
  const parts = nodes.map(n => printNode(n as AstNode, ind))
  if (allSingleLine(...parts)) {
    const flat = parts.join(` ${op} `)
    if (fits(flat, ind)) return flat
  }

  // Break: first at the current indent (it lives at the call site, not deeper),
  // rest indented with operator prefix. Using ind+1 for the first node would
  // over-indent any multi-line value it produces.
  // Reuse parts[0] — already rendered at ind above, no need to render twice.
  const restParts = nodes.slice(1).map(n => printNode(n as AstNode, ind + 1))
  return `${parts[0]!}\n${restParts.map(p => `${indent(ind + 1)}${op} ${p}`).join('\n')}`
}

/**
 * Print a handler clause body or transform body. Multi-statement bodies must
 * be wrapped in `do...end` because the handler grammar does not allow bare
 * semicolons at clause level — `@eff(x) -> let y = 1; y` is invalid syntax.
 */
function printHandlerBody(body: unknown[][], ind: number): string {
  // `with handler...end; body` and `with expr; body` are NOT valid as
  // standalone expressions — they require a `do...end` block context.
  // Treat a single WithHandler node the same as a multi-statement body.
  if (body.length === 1 && (body[0] as AstNode)[0] !== NodeTypes.WithHandler) {
    return printNode(body[0] as AstNode, ind)
  }
  // Multi-statement or WithHandler: always expand (no mid-line semicolons)
  const lines = body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1, true)}`)
  return `do\n${formatStatementLines(body.map(b => (b as AstNode)[2]), lines)}\n${indent(ind)}end`
}

function printHandler(payload: [unknown[], unknown], ind: number): string {
  const [clauses, transform] = payload as [
    { effectName: string; params: unknown[][]; body: unknown[][] }[],
    [unknown[], unknown[][]] | null,
  ]

  // Build per-clause strings at ind+1 (used for flat check and multi-clause form)
  const clauseStrs = clauses.map(clause => {
    const paramsStr = clause.params.length > 0
      ? `(${clause.params.map(p => printBindingTarget(p)).join(', ')})`
      : '()'
    const bodyStr = printHandlerBody(clause.body, ind + 1)
    return { inline: `@${clause.effectName}${paramsStr} -> ${bodyStr}`, bodyStr }
  })

  // Try flat single-line form: `handler @eff(p) -> body end`
  // Only when there's no transform and no clause body contains newlines.
  if (!transform && clauseStrs.every(c => !c.bodyStr.includes('\n'))) {
    const flat = `handler ${clauseStrs.map(c => c.inline).join(' ')} end`
    if (fits(flat, ind)) return flat
  }

  // Single-clause: put the clause header on the same line as `handler`.
  // The body is formatted at the handler's own indent level so that any
  // do...end block it produces closes at the right column.
  if (clauses.length === 1) {
    const clause = clauses[0]!
    const paramsStr = clause.params.length > 0
      ? `(${clause.params.map(p => printBindingTarget(p)).join(', ')})`
      : '()'
    const bodyStr = printHandlerBody(clause.body, ind)
    const parts: string[] = [`handler @${clause.effectName}${paramsStr} -> ${bodyStr}`]
    if (transform) {
      const [param, transformBody] = transform
      const paramStr = printBindingTarget(param)
      const transformBodyStr = printHandlerBody(transformBody, ind + 1)
      parts.push(`${indent(ind)}transform`)
      parts.push(`${indent(ind + 1)}${paramStr} -> ${transformBodyStr}`)
    }
    parts.push(`${indent(ind)}end`)
    return parts.join('\n')
  }

  // Multi-clause form: each clause indented under `handler`
  const parts: string[] = ['handler']
  for (const { inline } of clauseStrs) {
    parts.push(`${indent(ind + 1)}${inline}`)
  }
  if (transform) {
    const [param, body] = transform
    const paramStr = printBindingTarget(param)
    const bodyStr = printHandlerBody(body, ind + 1)
    parts.push(`${indent(ind)}transform`)
    parts.push(`${indent(ind + 1)}${paramStr} -> ${bodyStr}`)
  }
  parts.push(`${indent(ind)}end`)
  return parts.join('\n')
}

function printLoop(payload: [unknown[][], unknown[]], ind: number): string {
  const [bindingsArr, body] = payload
  const bindings = (bindingsArr as unknown[][][]).map(([target, value]) => {
    return `${printBindingTarget(target as unknown[])} = ${printNode(value as AstNode, ind)}`
  })
  // Body is a root slot — pass isRoot so #macro decorator style applies inside loop bodies
  const bodyStr = printNode(body as AstNode, ind, true)
  if (allSingleLine(...bindings, bodyStr)) {
    const flat = `loop (${bindings.join(', ')}) -> ${bodyStr}`
    if (fits(flat, ind)) return flat
  }

  return `loop (${bindings.join(', ')}) ->\n${indent(ind + 1)}${printNode(body as AstNode, ind + 1, true)}`
}

function printFor(payload: [unknown[][], unknown[]], ind: number): string {
  const [bindingLevels, body] = payload
  const levels: string[] = []
  for (const level of bindingLevels) {
    const [binding, letBindings, whenGuard, whileGuard] = level as [unknown[], unknown[], unknown[] | null, unknown[] | null]
    const [target, collection] = binding as [unknown[], unknown[]]
    let s = `${printBindingTarget(target)} in ${printNode(collection as AstNode, ind)}`
    /* v8 ignore next -- both branches tested; v8 miscounts Array.isArray on null vs [] */
    if (Array.isArray(letBindings)) {
      for (const lb of letBindings as unknown[][]) {
        const [lt, lv] = lb as [unknown[], unknown[]]
        s += ` let ${printBindingTarget(lt)} = ${printNode(lv as AstNode, ind)}`
      }
    }
    if (whenGuard) s += ` when ${printNode(whenGuard as AstNode, ind)}`
    if (whileGuard) s += ` while ${printNode(whileGuard as AstNode, ind)}`
    levels.push(s)
  }
  // Body is a root slot — pass isRoot so #macro decorator style applies inside for bodies
  const bodyStr = printNode(body as AstNode, ind, true)
  if (allSingleLine(...levels, bodyStr)) {
    const flat = `for (${levels.join(', ')}) -> ${bodyStr}`
    if (fits(flat, ind)) return flat
  }

  return `for (${levels.join(', ')}) ->\n${indent(ind + 1)}${printNode(body as AstNode, ind + 1, true)}`
}

function printMatch(payload: [unknown[], unknown[][]], ind: number): string {
  const [valueNode, cases] = payload
  const valueStr = printNode(valueNode as AstNode, ind)

  // Try flat: build case strings at outer indent, skip if any body is multi-line
  const flatCaseParts = cases.map(c => {
    const [pattern, body, guard] = c as [unknown[], unknown[], unknown[] | null]
    const patternStr = printMatchPattern(pattern)
    const bodyStr = printNode(body as AstNode, ind)
    if (guard) {
      return `case ${patternStr} when ${printNode(guard as AstNode, ind)} then ${bodyStr}`
    }
    return `case ${patternStr} then ${bodyStr}`
  })
  if (flatCaseParts.every(p => !p.includes('\n'))) {
    const flat = `match ${valueStr} ${flatCaseParts.join(' ')} end`
    if (fits(flat, ind)) return flat
  }

  // Multi-line: each case on its own line.
  // If a case body is itself multi-line, break after `then` and indent the body.
  const multiCaseParts = cases.map(c => {
    const [pattern, body, guard] = c as [unknown[], unknown[], unknown[] | null]
    const patternStr = printMatchPattern(pattern)
    const bodyStr = printNode(body as AstNode, ind + 1)
    const prefix = guard
      ? `case ${patternStr} when ${printNode(guard as AstNode, ind + 1)} then`
      : `case ${patternStr} then`
    if (!bodyStr.includes('\n')) return `${prefix} ${bodyStr}`
    // Multi-line body: break after `then`, body indented one level below `case`
    const bodyDeep = printNode(body as AstNode, ind + 2)
    return `${prefix}\n${indent(ind + 2)}${bodyDeep}`
  })

  const lines = multiCaseParts.map(c => `${indent(ind + 1)}${c}`)
  return `match ${valueStr}\n${lines.join('\n')}\n${indent(ind)}end`
}

function printCommaSeparated(name: string, items: unknown[][], ind: number): string {
  const itemStrs = items.map(a => printNode(a as AstNode, ind))
  if (allSingleLine(...itemStrs)) {
    const flat = `${name}(${itemStrs.join(', ')})`
    if (fits(flat, ind)) return flat
  }

  const lines = items.map(a => `${indent(ind + 1)}${printNode(a as AstNode, ind + 1)}`)
  return `${name}(\n${lines.join(',\n')},\n${indent(ind)})`
}

function printTemplateString(segments: unknown[][]): string {
  let result = '`'
  for (const seg of segments) {
    const segNode = seg as AstNode
    if (segNode[0] === NodeTypes.Str) {
      result += segNode[1] as string
    } else {
      result += `\${${printNode(segNode, 0)}}`
    }
  }
  return `${result}\``
}

function printCodeTemplate(payload: [unknown[][], unknown[][]], ind: number): string {
  const [bodyAst, spliceExprs] = payload
  // Print body nodes, replacing Splice nodes with $^{spliceExpr}.
  // Each body node is a root slot, so pass isRoot=true for decorator style.
  const bodyParts = bodyAst.map(node => printNodeWithSplices(node as AstNode, spliceExprs, ind, true))

  // Single statement: try flat
  if (bodyParts.length === 1 && allSingleLine(bodyParts[0]!)) {
    const flat = `quote ${bodyParts[0]} end`
    if (fits(flat, ind)) return flat
  }

  // Multi-statement, multi-line single statement, or too wide: expand.
  const lines = bodyParts.map(p => `${indent(ind + 1)}${p}`)
  return `quote\n${formatStatementLines(bodyAst.map(node => (node as AstNode)[2]), lines)}\nend`
}

/** Print an AST node, but render Splice nodes as $^{expr} using the splice expressions list. */
function printNodeWithSplices(node: AstNode, spliceExprs: unknown[][], ind: number, isRoot = false): string {
  const [type, payload] = node
  if (type === NodeTypes.Splice) {
    const index = payload as number
    const expr = spliceExprs[index]
    if (expr) {
      return `$^{${printNode(expr as AstNode, ind)}}`
    }
    throw new Error(`Invalid splice index ${index} in code template`)
  }
  // Walk AST and substitute Splice nodes before printing
  return printNode(substituteSplices(node, spliceExprs), ind, isRoot)
}

/** Recursively replace Splice nodes with synthetic AST that prints as $^{expr}. */
function substituteSplices(node: AstNode, spliceExprs: unknown[][]): AstNode {
  const [type, payload, id] = node
  if (type === NodeTypes.Splice) {
    const index = payload as number
    const expr = spliceExprs[index]
    const spliceText = expr ? `$^{${printNode(expr as AstNode, 0)}}` : `$^{<splice${index}>}`
    return [NodeTypes.Sym, spliceText, id]
  }
  if (!Array.isArray(payload)) return node
  const newPayload = payload.map(item => {
    if (Array.isArray(item)) {
      if (item.length >= 2 && typeof item[0] === 'string') {
        return substituteSplices(item as AstNode, spliceExprs)
      }
      return item.map(inner =>
        Array.isArray(inner) && inner.length >= 2 && typeof inner[0] === 'string'
          ? substituteSplices(inner as AstNode, spliceExprs)
          : inner,
      )
    }
    return item
  })
  return [type, newPayload, id]
}

// ---------------------------------------------------------------------------
// Pipe chain detection
// ---------------------------------------------------------------------------

/**
 * Detect pipe chains: nested single-arg calls where each callee is a named
 * symbol or builtin. Returns [innerValue, fn1, fn2, ...] or null.
 */
function extractPipeChain(fnNode: AstNode, argNodes: AstNode[]): AstNode[] | null {
  if (argNodes.length !== 1) return null
  if (fnNode[0] !== NodeTypes.Sym && fnNode[0] !== NodeTypes.Builtin) return null

  const chain: AstNode[] = [fnNode]
  let current = argNodes[0]!

  while (current[0] === NodeTypes.Call) {
    const [innerFn, innerArgs, innerHints] = current[1] as [AstNode, AstNode[], { isPipe?: boolean } | undefined]
    // Only follow inner nodes that were also authored as pipe — stops at nested regular calls
    if (!innerHints?.isPipe) break
    if (innerArgs.length !== 1) break
    if (innerFn[0] !== NodeTypes.Sym && innerFn[0] !== NodeTypes.Builtin) break
    chain.push(innerFn)
    current = innerArgs[0]!
  }

  if (chain.length < 2) return null
  chain.reverse()
  return [current, ...chain]
}

// ---------------------------------------------------------------------------
// Binding targets
// ---------------------------------------------------------------------------

function printBindingTarget(target: unknown[]): string {
  const targetType = target[0] as string
  const targetPayload = target[1] as unknown[]

  switch (targetType) {
    case 'symbol': {
      const [symNode, defaultExpr] = targetPayload as [unknown[], unknown[] | null]
      const name = symNode[1] as string
      if (defaultExpr) {
        return `${name} = ${printNode(defaultExpr as AstNode, 0)}`
      }
      return name
    }
    case 'rest': {
      const [name, defaultExpr] = targetPayload as [string, unknown[] | null]
      if (defaultExpr) {
        return `...${name} = ${printNode(defaultExpr as AstNode, 0)}`
      }
      return `...${name}`
    }
    case 'array': {
      const [targets, defaultExpr] = targetPayload as [unknown[][], unknown[] | null]
      // Empty slots (null) are represented as empty commas: [, , third]
      const inner = targets.map(t => t ? printBindingTarget(t) : '').join(', ')
      if (defaultExpr) {
        return `[${inner}] = ${printNode(defaultExpr as AstNode, 0)}`
      }
      return `[${inner}]`
    }
    case 'object': {
      const [record, defaultExpr] = targetPayload as [Record<string, unknown[]>, unknown[] | null]
      const entries = Object.entries(record).map(([key, bt]) => {
        // Rest binding: { ...rest }
        if (bt[0] === 'rest') {
          return `...${(bt[1] as unknown[])[0] as string}`
        }
        const btStr = printBindingTarget(bt)
        if (bt[0] === 'symbol') {
          const symName = (bt[1] as unknown[])[0] as unknown[]
          if ((symName[1] as string) === key) {
            // Shorthand: { name }
            return btStr
          }
          // Alias: { key as alias }
          return `${key} as ${btStr}`
        }
        // Nested destructuring: { key: pattern }
        return `${key}: ${btStr}`
      })
      if (defaultExpr) {
        return `{ ${entries.join(', ')} } = ${printNode(defaultExpr as AstNode, 0)}`
      }
      return `{ ${entries.join(', ')} }`
    }
    case 'literal': {
      const [expr] = targetPayload as [unknown[]]
      return printNode(expr as AstNode, 0)
    }
    case 'wildcard':
      return '_'
    default:
      return `<unknown-binding:${targetType}>`
  }
}

function printMatchPattern(pattern: unknown[]): string {
  return printBindingTarget(pattern)
}
