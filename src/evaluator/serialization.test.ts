import { describe, expect, it } from 'vitest'
import { EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from '../utils/symbols'
import type { Any } from '../interface'
import type {
  CompFunction,
  ComplementFunction,
  ConstantlyFunction,
  EffectRef,
  EveryPredFunction,
  FNullFunction,
  FunctionLike,
  JuxtFunction,
  ModuleFunction,
  NormalBuiltinFunction,
  PartialFunction,
  SomePredFunction,
  SpecialBuiltinFunction,
  UserDefinedFunction,
} from '../parser/types'
import { describeSerializationIssue, isSerializable } from './serialization'

function makeUserDefinedFunction(): UserDefinedFunction {
  const fn: UserDefinedFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'UserDefined',
    name: 'myFn',
    evaluatedfunction: [[], [], {}],
    docString: '',
    arity: {},
  }
  return fn
}

function makeBuiltinFunction(): NormalBuiltinFunction {
  const fn: NormalBuiltinFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'Builtin',
    normalBuiltinSymbolType: 0,
    name: '+',
    arity: {},
  }
  return fn
}

function makeSpecialBuiltinFunction(): SpecialBuiltinFunction {
  const fn: SpecialBuiltinFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'SpecialBuiltin',
    specialBuiltinSymbolType: 0 as SpecialBuiltinFunction['specialBuiltinSymbolType'],
    arity: {},
  }
  return fn
}

function makeModuleFunction(): ModuleFunction {
  const fn: ModuleFunction = {
    [FUNCTION_SYMBOL]: true,
    functionType: 'Module',
    moduleName: 'math',
    functionName: 'sin',
    arity: {},
  }
  return fn
}

describe('isSerializable', () => {
  describe('primitives', () => {
    it('should accept null', () => {
      expect(isSerializable(null)).toBe(true)
    })
    it('should accept numbers', () => {
      expect(isSerializable(0)).toBe(true)
      expect(isSerializable(42)).toBe(true)
      expect(isSerializable(-3.14)).toBe(true)
    })
    it('should accept strings', () => {
      expect(isSerializable('')).toBe(true)
      expect(isSerializable('hello')).toBe(true)
    })
    it('should accept booleans', () => {
      expect(isSerializable(true)).toBe(true)
      expect(isSerializable(false)).toBe(true)
    })
  })

  describe('arrays', () => {
    it('should accept empty arrays', () => {
      expect(isSerializable([])).toBe(true)
    })
    it('should accept arrays of primitives', () => {
      expect(isSerializable([1, 'two', true, null])).toBe(true)
    })
    it('should accept nested arrays', () => {
      expect(isSerializable([[1, 2], [3, [4, 5]]])).toBe(true)
    })
  })

  describe('objects', () => {
    it('should accept empty objects', () => {
      expect(isSerializable({})).toBe(true)
    })
    it('should accept objects with primitive values', () => {
      expect(isSerializable({ a: 1, b: 'two', c: true, d: null })).toBe(true)
    })
    it('should accept nested objects', () => {
      expect(isSerializable({ a: { b: { c: 42 } } })).toBe(true)
    })
  })

  describe('regularExpression', () => {
    it('should accept regular expressions', () => {
      const re: Any = { [REGEXP_SYMBOL]: true, s: 'abc', f: 'gi' }
      expect(isSerializable(re)).toBe(true)
    })
  })

  describe('effectRef', () => {
    it('should accept EffectRef values', () => {
      const ref: EffectRef = { [EFFECT_SYMBOL]: true, name: 'llm.complete' }
      expect(isSerializable(ref as Any)).toBe(true)
    })

    it('should accept EffectRef with dotted name', () => {
      const ref: EffectRef = { [EFFECT_SYMBOL]: true, name: 'com.myco.human.approve' }
      expect(isSerializable(ref as Any)).toBe(true)
    })

    it('should accept arrays containing EffectRef', () => {
      const ref: EffectRef = { [EFFECT_SYMBOL]: true, name: 'dvala.io.println' }
      expect(isSerializable([1, ref] as Any)).toBe(true)
    })

    it('should accept objects containing EffectRef', () => {
      const ref: EffectRef = { [EFFECT_SYMBOL]: true, name: 'dvala.time.now' }
      const obj: Any = { eff: ref }
      expect(isSerializable(obj)).toBe(true)
    })
  })

  describe('dvalaFunction types', () => {
    it('should accept UserDefinedFunction', () => {
      expect(isSerializable(makeUserDefinedFunction() as Any)).toBe(true)
    })
    it('should accept NormalBuiltinFunction', () => {
      expect(isSerializable(makeBuiltinFunction() as Any)).toBe(true)
    })
    it('should accept SpecialBuiltinFunction', () => {
      expect(isSerializable(makeSpecialBuiltinFunction() as Any)).toBe(true)
    })
    it('should accept ModuleFunction', () => {
      expect(isSerializable(makeModuleFunction() as Any)).toBe(true)
    })
  })

  describe('compound function types', () => {
    it('should accept PartialFunction with serializable inner function', () => {
      const partial: PartialFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Partial',
        function: makeUserDefinedFunction(),
        params: [1, 'two'],
        placeholders: [2],
        arity: {},
      }
      expect(isSerializable(partial as Any)).toBe(true)
    })

    it('should accept CompFunction with serializable functions', () => {
      const comp: CompFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Comp',
        params: [makeUserDefinedFunction(), makeBuiltinFunction()],
        arity: {},
      }
      expect(isSerializable(comp as Any)).toBe(true)
    })

    it('should accept ConstantlyFunction with serializable value', () => {
      const constantly: ConstantlyFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Constantly',
        value: 42,
        arity: {},
      }
      expect(isSerializable(constantly as Any)).toBe(true)
    })

    it('should accept JuxtFunction with serializable functions', () => {
      const juxt: JuxtFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Juxt',
        params: [makeUserDefinedFunction()],
        arity: {},
      }
      expect(isSerializable(juxt as Any)).toBe(true)
    })

    it('should accept ComplementFunction with serializable function', () => {
      const complement: ComplementFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Complement',
        function: makeUserDefinedFunction(),
        arity: {},
      }
      expect(isSerializable(complement as Any)).toBe(true)
    })

    it('should accept EveryPredFunction with serializable predicates', () => {
      const everyPred: EveryPredFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'EveryPred',
        params: [makeUserDefinedFunction()],
        arity: {},
      }
      expect(isSerializable(everyPred as Any)).toBe(true)
    })

    it('should accept SomePredFunction with serializable predicates', () => {
      const somePred: SomePredFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'SomePred',
        params: [makeUserDefinedFunction()],
        arity: {},
      }
      expect(isSerializable(somePred as Any)).toBe(true)
    })

    it('should accept FNullFunction with serializable inner function and params', () => {
      const fnull: FNullFunction = {
        [FUNCTION_SYMBOL]: true,
        functionType: 'Fnull',
        function: makeUserDefinedFunction(),
        params: [1, 'default'],
        arity: {},
      }
      expect(isSerializable(fnull as Any)).toBe(true)
    })
  })

  describe('circular references', () => {
    it('should return false for circular arrays', () => {
      const arr: unknown[] = [1, 2]
      arr.push(arr)
      expect(isSerializable(arr)).toBe(false)
    })

    it('should return false for circular objects', () => {
      const obj: Record<string, unknown> = { a: 1 }
      obj.self = obj
      expect(isSerializable(obj)).toBe(false)
    })
  })
})

describe('describeSerializationIssue', () => {
  it('should return null for serializable primitives', () => {
    expect(describeSerializationIssue(null)).toBeNull()
    expect(describeSerializationIssue(42)).toBeNull()
    expect(describeSerializationIssue('hello')).toBeNull()
    expect(describeSerializationIssue(true)).toBeNull()
  })

  it('should return null for serializable functions', () => {
    expect(describeSerializationIssue(makeUserDefinedFunction() as Any)).toBeNull()
    expect(describeSerializationIssue(makeBuiltinFunction() as Any)).toBeNull()
  })

  it('should return null for fully serializable compound types', () => {
    const partial: PartialFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Partial',
      function: makeUserDefinedFunction(),
      params: [1, 'two'],
      placeholders: [2],
      arity: {},
    }
    expect(describeSerializationIssue(partial as Any)).toBeNull()
  })

  it('should return null for serializable CompFunction', () => {
    const comp: CompFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Comp',
      params: [makeUserDefinedFunction()],
      arity: {},
    }
    expect(describeSerializationIssue(comp as Any)).toBeNull()
  })

  it('should return null for serializable ComplementFunction', () => {
    const complement: ComplementFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Complement',
      function: makeUserDefinedFunction(),
      arity: {},
    }
    expect(describeSerializationIssue(complement as Any)).toBeNull()
  })

  it('should return null for serializable ConstantlyFunction', () => {
    const constantly: ConstantlyFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Constantly',
      value: 42,
      arity: {},
    }
    expect(describeSerializationIssue(constantly as Any)).toBeNull()
  })

  it('should return null for serializable JuxtFunction', () => {
    const juxt: JuxtFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Juxt',
      params: [makeUserDefinedFunction()],
      arity: {},
    }
    expect(describeSerializationIssue(juxt as Any)).toBeNull()
  })

  it('should return null for serializable EveryPredFunction', () => {
    const everyPred: EveryPredFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'EveryPred',
      params: [makeUserDefinedFunction()],
      arity: {},
    }
    expect(describeSerializationIssue(everyPred as Any)).toBeNull()
  })

  it('should return null for serializable SomePredFunction', () => {
    const somePred: SomePredFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'SomePred',
      params: [makeUserDefinedFunction()],
      arity: {},
    }
    expect(describeSerializationIssue(somePred as Any)).toBeNull()
  })

  it('should return null for serializable FNullFunction', () => {
    const fnull: FNullFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Fnull',
      function: makeUserDefinedFunction(),
      params: [1, 'default'],
      arity: {},
    }
    expect(describeSerializationIssue(fnull as Any)).toBeNull()
  })

  it('should return null for serializable arrays', () => {
    expect(describeSerializationIssue([1, 'two', true])).toBeNull()
  })

  it('should return null for serializable objects', () => {
    expect(describeSerializationIssue({ a: 1, b: 'two' })).toBeNull()
  })

  it('should return null for RegularExpression', () => {
    const re: Any = { [REGEXP_SYMBOL]: true, s: 'abc', f: 'gi' }
    expect(describeSerializationIssue(re)).toBeNull()
  })

  it('should return null for EffectRef', () => {
    const ref: EffectRef = { [EFFECT_SYMBOL]: true, name: 'llm.complete' }
    expect(describeSerializationIssue(ref as Any)).toBeNull()
  })

  it('should return null for SpecialBuiltinFunction', () => {
    expect(describeSerializationIssue(makeSpecialBuiltinFunction() as Any)).toBeNull()
  })

  it('should return null for ModuleFunction', () => {
    expect(describeSerializationIssue(makeModuleFunction() as Any)).toBeNull()
  })

  it('should describe unknown function type', () => {
    const unknownFn = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'UnknownType',
      arity: {},
    }
    const issue = describeSerializationIssue(unknownFn as Any)
    expect(issue).toContain('unknown function type')
  })

  it('should describe unexpected type', () => {
    // Force a non-object, non-primitive value through
    const issue = describeSerializationIssue(undefined as unknown as Any)
    expect(issue).toContain('unexpected type')
  })
})

describe('isSerializable edge cases', () => {
  it('should return false for unexpected non-object non-primitive value', () => {
    // Force an unexpected type (e.g. undefined) through the type system
    expect(isSerializable(undefined as unknown as Any)).toBe(false)
  })
})

// Non-serializable inner values in compound function types
const BAD = undefined as unknown as Any

describe('describeSerializationIssue — non-serializable compound functions', () => {
  it('should detect non-serializable inner function in Partial', () => {
    const partial: PartialFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Partial',
      function: BAD as unknown as FunctionLike,
      params: [1],
      placeholders: [],
      arity: {},
    }
    expect(describeSerializationIssue(partial as Any)).toContain('.function')
  })

  it('should detect non-serializable param in Partial', () => {
    const partial: PartialFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Partial',
      function: makeUserDefinedFunction(),
      params: [BAD],
      placeholders: [],
      arity: {},
    }
    expect(describeSerializationIssue(partial as Any)).toContain('params[0]')
  })

  it('should detect non-serializable param in Comp', () => {
    const comp: CompFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Comp',
      params: [BAD],
      arity: {},
    }
    expect(describeSerializationIssue(comp as Any)).toContain('params[0]')
  })

  it('should detect non-serializable param in Juxt', () => {
    const juxt: JuxtFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Juxt',
      params: [BAD],
      arity: {},
    }
    expect(describeSerializationIssue(juxt as Any)).toContain('params[0]')
  })

  it('should detect non-serializable param in EveryPred', () => {
    const everyPred: EveryPredFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'EveryPred',
      params: [BAD],
      arity: {},
    }
    expect(describeSerializationIssue(everyPred as Any)).toContain('params[0]')
  })

  it('should detect non-serializable param in SomePred', () => {
    const somePred: SomePredFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'SomePred',
      params: [BAD],
      arity: {},
    }
    expect(describeSerializationIssue(somePred as Any)).toContain('params[0]')
  })

  it('should detect non-serializable inner function in Fnull', () => {
    const fnull: FNullFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Fnull',
      function: BAD as unknown as FunctionLike,
      params: [1],
      arity: {},
    }
    expect(describeSerializationIssue(fnull as Any)).toContain('.function')
  })

  it('should detect non-serializable param in Fnull', () => {
    const fnull: FNullFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'Fnull',
      function: makeUserDefinedFunction(),
      params: [BAD],
      arity: {},
    }
    expect(describeSerializationIssue(fnull as Any)).toContain('params[0]')
  })

  it('should detect non-serializable element in array', () => {
    const arr = [1, BAD, 3]
    expect(describeSerializationIssue(arr)).toContain('[1]')
  })

  it('should detect non-serializable value in object', () => {
    const obj = { a: 1, b: BAD }
    expect(describeSerializationIssue(obj)).toContain('.b')
  })
})
