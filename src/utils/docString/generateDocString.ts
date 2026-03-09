import { smartTrim } from '..'
import type { Argument, EffectReference, FunctionReference, TypedValue } from '../../../reference'

type DocStringSource = FunctionReference | EffectReference

export function generateDocString(reference: DocStringSource): string {
  return smartTrim(`
    ${reference.title}

    ${reference.description
        .replace(/`(.+?)`/g, '$1')
        .replace(/\$(\w+)/g, '$1')
        .replace(/\*\*\*(.+)\*\*\*/g, '$1')
        .replace(/\*\*(.+)\*\*/g, '$1')
    }

    Signature:
    ${signature(reference).join('\n    ')}

    Arguments:
      ${argStrings(reference).join('\n      ')}

    Examples:
${reference.examples.map(example => smartTrim(example, 4)).join('\n\n')}`)
}

function isEffectRef(ref: DocStringSource): ref is EffectReference {
  return 'effect' in ref
}

function signature(reference: DocStringSource): string[] {
  const { title, variants, args, returns } = reference
  const isOperator = !isEffectRef(reference) && reference._isOperator

  const functionForms = variants.map(variant => {
    if (isEffectRef(reference)) {
      // Effect form: perform(effect(name), arg1, arg2)
      const argsStr = variant.argumentNames.length > 0
        ? `, ${variant.argumentNames.map(argName => {
          let result = ''
          const arg = args[argName]!
          if (arg.rest) {
            result += '...'
          }
          result += argName
          return result
        }).join(', ')}`
        : ''
      return `  perform(effect(${title})${argsStr}) -> ${type(returns)}`
    }

    const form = `  ${title}(${variant.argumentNames.map(argName => {
      let result = ''
      const arg = args[argName]!
      if (arg.rest) {
        result += '...'
      }
      result += argName
      return result
    }).join(', ')})`

    return `${form} -> ${type(returns)}`
  })

  const operatorForm = isOperator ? ['', 'Operator:', `  a ${title} b -> ${type(returns)}`] : []

  return [
    ...functionForms,
    ...operatorForm,
  ]
}

function type(arg: Argument | TypedValue) {
  const argType = arg.type
  const types = Array.isArray(argType) ? argType : [argType]
  const typeString = types.join(' | ')
  return arg.array || arg.rest ? `Array<${typeString}>` : typeString
}

function argStrings(reference: FunctionReference): string[] {
  return Object.entries(reference.args).map(([argName, arg]) => `${argName}: ${type(arg)}`)
}
