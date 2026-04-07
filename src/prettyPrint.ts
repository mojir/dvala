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

import { MAX_WIDTH } from './formatter/config'

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

// Infix binary operators rendered as `a op b`
const infixOperators = new Set([
  '+', '-', '*', '/', '^', '%', '==', '!=',
  '<', '>', '<=', '>=', '++',
  '&', '|', 'xor', '<<', '>>', '>>>',
])

// Operator precedence (higher number = tighter binding).
// Used to decide when an infix sub-expression needs parentheses.
const operatorPrecedence: Record<string, number> = {
  '|>': 1,
  '??': 2,
  '||': 3,
  '&&': 4,
  '==': 5, '!=': 5,
  '<': 6, '>': 6, '<=': 6, '>=': 6,
  '++': 7,
  '&': 8, '|': 8, 'xor': 8, '<<': 8, '>>': 8, '>>>': 8,
  '+': 9, '-': 9,
  '*': 10, '/': 10, '%': 10,
  '^': 11,
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Convert an AST node to readable Dvala source. */
export function prettyPrint(node: unknown): string {
  return printNode(node as AstNode, 0)
}

// ---------------------------------------------------------------------------
// Node printing — each function tries flat first, breaks if too wide
// ---------------------------------------------------------------------------

function printNode(node: AstNode, ind: number): string {
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
      const [fnNode, args] = payload as [AstNode, AstNode[]]
      return `#${printNode(fnNode, ind)} ${args.map(a => printNode(a, ind)).join(', ')}`
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
      // Try flat inline form: `with handler ... end; body1; body2`
      const handlerFlat = printNode(handlerExpr as AstNode, ind)
      const bodyFlats = bodyExprs.map(b => printNode(b as AstNode, ind))
      const flat = `with ${handlerFlat}; ${bodyFlats.join('; ')}`
      if (!handlerFlat.includes('\n') && fits(flat, ind)) return flat
      // Multi-line form
      const handlerStr = printNode(handlerExpr as AstNode, ind)
      const bodyStrs = bodyExprs.map(b => printNode(b as AstNode, ind + 1))
      return `with ${handlerStr};\n${bodyStrs.map(s => `${indent(ind + 1)}${s}`).join(';\n')}`
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
      const flat = pipeChain.map(n => printNode(n, ind)).join(' |> ')
      if (fits(flat, ind)) return flat
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
    return `${printNode(argNodes[0]!, ind)} ${fnNode[1] as string} ${printNode(argNodes[1]!, ind)}`
  }

  // Regular function call — wrap callee in parens if it's a complex expression (lambda, etc.)
  const rawFnStr = printNode(fnNode, ind)
  const needsParens = fnNode[0] === NodeTypes.Function || fnNode[0] === NodeTypes.Macro
  const fnStr = needsParens ? `(${rawFnStr})` : rawFnStr
  const flat = `${fnStr}(${argNodes.map(a => printNode(a, ind)).join(', ')})`
  if (fits(flat, ind)) return flat

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

  // Try flat
  const thenStr = printNode(thenNode, ind)
  if (elseNode) {
    const elseStr = isElseIf
      ? printIf((elseNode)[1] as unknown[][], ind)
      : printNode(elseNode, ind)
    const flat = isElseIf
      ? `if ${cond} then ${thenStr} else ${elseStr}`
      : `if ${cond} then ${thenStr} else ${elseStr} end`
    if (fits(flat, ind)) return flat
  } else {
    const flat = `if ${cond} then ${thenStr} end`
    if (fits(flat, ind)) return flat
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
  // Try flat
  const flatParts = stmts.map(s => printNode(s as AstNode, ind))
  const flat = `do ${flatParts.join('; ')} end`
  if (fits(flat, ind)) return flat

  // Multi-line: each statement on its own line
  const lines = stmts.map(s => `${indent(ind + 1)}${printNode(s as AstNode, ind + 1)}`)
  return `do\n${lines.join(';\n')}\n${indent(ind)}end`
}

function printLet(payload: [unknown[], unknown[]], ind: number): string {
  const [target, value] = payload
  return `let ${printBindingTarget(target)} = ${printNode(value as AstNode, ind)}`
}

function printFunction(payload: [unknown[][], unknown[][], unknown?], ind: number): string {
  const [params, body, rawHints] = payload
  const hints = rawHints as { isShorthand?: boolean } | undefined

  // Shorthand lambda: authored as `-> expr` with no explicit params.
  // Preserve the form so the formatter does not add ($) prefix.
  if (hints?.isShorthand) {
    if (body.length === 1 && (body[0] as AstNode)[0] !== NodeTypes.WithHandler) {
      const flat = `-> ${printNode(body[0] as AstNode, ind)}`
      if (fits(flat, ind)) return flat
      return `->\n${indent(ind + 1)}${printNode(body[0] as AstNode, ind + 1)}`
    }
    const flatBody = body.map(b => printNode(b as AstNode, ind)).join('; ')
    const flat = `-> do ${flatBody} end`
    if (fits(flat, ind)) return flat
    const lines = body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1)}`)
    return `-> do\n${lines.join(';\n')}\n${indent(ind)}end`
  }

  const paramStr = params.map(p => printBindingTarget(p)).join(', ')

  if (body.length === 1) {
    // `with handler...end; body` is NOT a valid standalone expression — it can
    // only appear inside a `do...end` block. Wrap it in do...end when it's a
    // single-body function, treating it like a multi-statement body.
    if ((body[0] as AstNode)[0] !== NodeTypes.WithHandler) {
      const flat = `(${paramStr}) -> ${printNode(body[0] as AstNode, ind)}`
      if (fits(flat, ind)) return flat
      // Break body to next line
      return `(${paramStr}) ->\n${indent(ind + 1)}${printNode(body[0] as AstNode, ind + 1)}`
    }
  }

  // Multi-statement body (or single WithHandler): always use do...end
  const flatBody = body.map(b => printNode(b as AstNode, ind)).join('; ')
  const flat = `(${paramStr}) -> do ${flatBody} end`
  if (fits(flat, ind)) return flat

  const lines = body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1)}`)
  return `(${paramStr}) -> do\n${lines.join(';\n')}\n${indent(ind)}end`
}

function printMacro(payload: [unknown[][], unknown[][], string | null], ind: number): string {
  const [params, body, qualifiedName] = payload
  const paramStr = params.map(p => printBindingTarget(p)).join(', ')
  const namePrefix = qualifiedName ? `macro@${qualifiedName}` : 'macro'

  if (body.length === 1) {
    const flat = `${namePrefix} (${paramStr}) -> ${printNode(body[0] as AstNode, ind)}`
    if (fits(flat, ind)) return flat
    return `${namePrefix} (${paramStr}) ->\n${indent(ind + 1)}${printNode(body[0] as AstNode, ind + 1)}`
  }

  const flatBody = body.map(b => printNode(b as AstNode, ind)).join('; ')
  const flat = `${namePrefix} (${paramStr}) -> do ${flatBody} end`
  if (fits(flat, ind)) return flat

  const lines = body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1)}`)
  return `${namePrefix} (${paramStr}) -> do\n${lines.join(';\n')}\n${indent(ind)}end`
}

function printPerform(payload: [unknown[], unknown[] | undefined], ind: number): string {
  const [eff, arg] = payload
  if (arg) {
    return `perform(${printNode(eff as AstNode, ind)}, ${printNode(arg as AstNode, ind)})`
  }
  return `perform(${printNode(eff as AstNode, ind)})`
}

function printArray(elements: unknown[][], ind: number): string {
  if (elements.length === 0) return '[]'
  const flat = `[${elements.map(e => printNode(e as AstNode, ind)).join(', ')}]`
  if (fits(flat, ind)) return flat

  const lines = elements.map(e => `${indent(ind + 1)}${printNode(e as AstNode, ind + 1)}`)
  return `[\n${lines.join(',\n')},\n${indent(ind)}]`
}

function printObject(entries: unknown[][], ind: number): string {
  if (entries.length === 0) return '{}'

  // Try flat first
  const flatParts = entries.map(entry => formatObjectEntry(entry, ind))
  const flat = `{ ${flatParts.join(', ')} }`
  if (fits(flat, ind)) return flat

  // Multi-line — reformat at deeper indent
  const multiParts = entries.map(entry => formatObjectEntry(entry, ind + 1))
  const lines = multiParts.map(p => `${indent(ind + 1)}${p}`)
  return `{\n${lines.join(',\n')},\n${indent(ind)}}`
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
  const flat = nodes.map(n => printNode(n as AstNode, ind)).join(` ${op} `)
  if (fits(flat, ind)) return flat

  // Break: first on current line, rest indented with operator prefix
  const parts = nodes.map(n => printNode(n as AstNode, ind + 1))
  return `${parts[0]!}\n${parts.slice(1).map(p => `${indent(ind + 1)}${op} ${p}`).join('\n')}`
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
  const stmts = body.map(b => printNode(b as AstNode, ind + 1)).join('; ')
  const flat = `do ${stmts} end`
  if (fits(flat, ind)) return flat
  return `do\n${body.map(b => `${indent(ind + 1)}${printNode(b as AstNode, ind + 1)}`).join(';\n')}\n${indent(ind)}end`
}

function printHandler(payload: [unknown[], unknown], ind: number): string {
  const [clauses, transform] = payload as [
    { effectName: string; params: unknown[][]; body: unknown[][] }[],
    [unknown[], unknown[][]] | null,
  ]

  // Build per-clause strings (without leading indentation for flat check)
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

  // Multi-line form
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
  const flat = `loop (${bindings.join(', ')}) -> ${printNode(body as AstNode, ind)}`
  if (fits(flat, ind)) return flat

  return `loop (${bindings.join(', ')}) ->\n${indent(ind + 1)}${printNode(body as AstNode, ind + 1)}`
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
  const flat = `for (${levels.join(', ')}) -> ${printNode(body as AstNode, ind)}`
  if (fits(flat, ind)) return flat

  return `for (${levels.join(', ')}) ->\n${indent(ind + 1)}${printNode(body as AstNode, ind + 1)}`
}

function printMatch(payload: [unknown[], unknown[][]], ind: number): string {
  const [valueNode, cases] = payload
  const valueStr = printNode(valueNode as AstNode, ind)

  const caseParts = cases.map(c => {
    const [pattern, body, guard] = c as [unknown[], unknown[], unknown[] | null]
    const patternStr = printMatchPattern(pattern)
    const bodyStr = printNode(body as AstNode, ind + 1)
    if (guard) {
      return `case ${patternStr} when ${printNode(guard as AstNode, ind + 1)} then ${bodyStr}`
    }
    return `case ${patternStr} then ${bodyStr}`
  })

  // Try flat
  const flat = `match ${valueStr} ${caseParts.join(' ')} end`
  if (fits(flat, ind)) return flat

  // Multi-line: each case on its own line
  const lines = caseParts.map(c => `${indent(ind + 1)}${c}`)
  return `match ${valueStr}\n${lines.join('\n')}\n${indent(ind)}end`
}

function printCommaSeparated(name: string, items: unknown[][], ind: number): string {
  const flat = `${name}(${items.map(a => printNode(a as AstNode, ind)).join(', ')})`
  if (fits(flat, ind)) return flat

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
  // Print body nodes, replacing Splice nodes with $^{spliceExpr}
  const bodyParts = bodyAst.map(node => printNodeWithSplices(node as AstNode, spliceExprs, ind))
  const inner = bodyParts.join('; ')
  return `quote ${inner} end`
}

/** Print an AST node, but render Splice nodes as $^{expr} using the splice expressions list. */
function printNodeWithSplices(node: AstNode, spliceExprs: unknown[][], ind: number): string {
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
  return printNode(substituteSplices(node, spliceExprs), ind)
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
