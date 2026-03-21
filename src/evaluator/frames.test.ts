import { describe, expect, it } from 'vitest'
import type {
  AndFrame,
  ArrayBuildFrame,
  AutoCheckpointFrame,
  BindingSlotFrame,
  CallFnFrame,
  ComplementFrame,
  CompFrame,
  CondFrame,
  ContinuationStack,
  EffectRefFrame,
  EffectResumeFrame,
  EvalArgsFrame,
  EveryPredFrame,
  FnArgBindFrame,
  FnArgSlotCompleteFrame,
  FnBodyFrame,
  FnRestArgCompleteFrame,
  ForBindingLevelState,
  ForElementBindCompleteFrame,
  ForLetBindFrame,
  ForLoopFrame,
  Frame,
  HandlerInvokeFrame,
  IfBranchFrame,
  JuxtFrame,
  LetBindCompleteFrame,
  LetBindFrame,
  LoopBindCompleteFrame,
  LoopBindFrame,
  LoopIterateFrame,
  MatchFrame,
  NanCheckFrame,
  ObjectBuildFrame,
  OrFrame,
  ParallelResumeFrame,
  PerformArgsFrame,
  QqFrame,
  RecurFrame,
  RecurLoopRebindFrame,
  SequenceFrame,
  SomePredFrame,
  TryWithFrame,
} from './frames'

describe('frame types', () => {
  // All 20 frame types are type-only — no runtime code to cover.
  // These tests verify that:
  // 1. All frame interfaces are importable and well-typed
  // 2. The discriminated union works correctly
  // 3. Frame instances can be created with correct shapes

  it('should discriminate frame types via type field', () => {
    // Verify that each Frame.type is unique and the union discriminant works.
    // We build a map from type string to boolean.
    const frameTypes: Record<Frame['type'], boolean> = {
      Sequence: true,
      IfBranch: true,
      Cond: true,
      Match: true,
      And: true,
      Or: true,
      Qq: true,
      TemplateStringBuild: true,
      ArrayBuild: true,
      ObjectBuild: true,
      LetBind: true,
      LetBindComplete: true,
      LoopBind: true,
      LoopBindComplete: true,
      LoopIterate: true,
      ForLoop: true,
      ForElementBindComplete: true,
      ForLetBind: true,
      Recur: true,
      RecurLoopRebind: true,
      PerformArgs: true,
      TryWith: true,
      EffectRef: true,
      HandlerInvoke: true,
      Complement: true,
      Comp: true,
      Juxt: true,
      EveryPred: true,
      SomePred: true,
      EffectResume: true,
      ParallelResume: true,
      EvalArgs: true,
      CallFn: true,
      FnBody: true,
      FnArgBind: true,
      FnArgSlotComplete: true,
      FnRestArgComplete: true,
      BindingSlot: true,
      MatchSlot: true,
      NanCheck: true,
      DebugStep: true,
      ImportMerge: true,
      AutoCheckpoint: true,
      HandleWith: true,
      HandleSetup: true,
    }
    expect(Object.keys(frameTypes)).toHaveLength(45)
  })

  it('should support ContinuationStack as Frame array', () => {
    const stack: ContinuationStack = []
    expect(Array.isArray(stack)).toBe(true)
    expect(stack).toHaveLength(0)
  })

  it('should cover all frame type discriminants exhaustively', () => {
    // This function uses the TypeScript exhaustiveness check pattern.
    // If a frame type is added but not handled, TypeScript will flag it.
    function getFrameCategory(frame: Frame): string {
      switch (frame.type) {
        case 'Sequence': return 'flow'
        case 'IfBranch': return 'branch'
        case 'Cond': return 'branch'
        case 'Match': return 'branch'
        case 'And': return 'short-circuit'
        case 'Or': return 'short-circuit'
        case 'Qq': return 'short-circuit'
        case 'TemplateStringBuild': return 'collection'
        case 'ArrayBuild': return 'collection'
        case 'ObjectBuild': return 'collection'
        case 'LetBind': return 'binding'
        case 'LetBindComplete': return 'binding'
        case 'LoopBind': return 'binding'
        case 'LoopBindComplete': return 'binding'
        case 'LoopIterate': return 'binding'
        case 'ForLoop': return 'binding'
        case 'ForElementBindComplete': return 'binding'
        case 'ForLetBind': return 'binding'
        case 'Recur': return 'control'
        case 'RecurLoopRebind': return 'control'
        case 'PerformArgs': return 'control'
        case 'TryWith': return 'effect'
        case 'EffectRef': return 'effect'
        case 'HandlerInvoke': return 'effect'
        case 'Complement': return 'compound'
        case 'Comp': return 'compound'
        case 'Juxt': return 'compound'
        case 'EveryPred': return 'compound'
        case 'SomePred': return 'compound'
        case 'EffectResume': return 'effect'
        case 'ParallelResume': return 'parallel'
        case 'EvalArgs': return 'call'
        case 'CallFn': return 'call'
        case 'FnBody': return 'call'
        case 'FnArgBind': return 'destructure'
        case 'FnArgSlotComplete': return 'destructure'
        case 'FnRestArgComplete': return 'destructure'
        case 'BindingSlot': return 'destructure'
        case 'MatchSlot': return 'destructure'
        case 'NanCheck': return 'post'
        case 'DebugStep': return 'debug'
        case 'ImportMerge': return 'import'
        case 'AutoCheckpoint': return 'checkpoint'
        case 'HandleWith': return 'effect'
        case 'HandleSetup': return 'effect'
        default: {
          // Exhaustiveness check: if this line is reached, a frame type is missing
          const _exhaustive: never = frame
          throw new Error(`Unhandled frame type: ${(_exhaustive as Frame).type}`)
        }
      }
    }

    // Just verify the function is well-typed (compilation is the real test)
    expect(typeof getFrameCategory).toBe('function')
  })

  it('should allow ForBindingLevelState to be used in ForLoopFrame', () => {
    const levelState: ForBindingLevelState = {
      collection: [1, 2, 3],
      index: 0,
    }
    expect(levelState.collection).toEqual([1, 2, 3])
    expect(levelState.index).toBe(0)
  })

  it('should ensure frame type names are unique strings', () => {
    // Build the set of all type discriminants.
    // TypeScript's type system ensures uniqueness, but we also verify at runtime.
    const types: Frame['type'][] = [
      'Sequence',
      'IfBranch',
      'Cond',
      'Match',
      'And',
      'Or',
      'Qq',
      'ArrayBuild',
      'ObjectBuild',
      'LetBind',
      'LetBindComplete',
      'LoopBind',
      'LoopBindComplete',
      'LoopIterate',
      'ForLoop',
      'ForElementBindComplete',
      'ForLetBind',
      'Recur',
      'RecurLoopRebind',
      'PerformArgs',
      'TryWith',
      'EffectRef',
      'EffectResume',
      'HandlerInvoke',
      'Complement',
      'Comp',
      'Juxt',
      'EveryPred',
      'SomePred',
      'ParallelResume',
      'EvalArgs',
      'CallFn',
      'FnBody',
      'FnArgBind',
      'FnArgSlotComplete',
      'FnRestArgComplete',
      'BindingSlot',
      'MatchSlot',
      'NanCheck',
      'DebugStep',
      'ImportMerge',
    ]
    const uniqueTypes = new Set(types)
    expect(uniqueTypes.size).toBe(types.length)
    expect(uniqueTypes.size).toBe(41)
  })

  it('should export individual frame interfaces for typed access', () => {
    // Verify all individual frame types are importable (compile-time check).
    // We use type assertions to verify the type field matches.
    const _sequence: SequenceFrame['type'] = 'Sequence'
    const _ifBranch: IfBranchFrame['type'] = 'IfBranch'
    const _cond: CondFrame['type'] = 'Cond'
    const _match: MatchFrame['type'] = 'Match'
    const _and: AndFrame['type'] = 'And'
    const _or: OrFrame['type'] = 'Or'
    const _qq: QqFrame['type'] = 'Qq'
    const _arrayBuild: ArrayBuildFrame['type'] = 'ArrayBuild'
    const _objectBuild: ObjectBuildFrame['type'] = 'ObjectBuild'
    const _letBind: LetBindFrame['type'] = 'LetBind'
    const _letBindComplete: LetBindCompleteFrame['type'] = 'LetBindComplete'
    const _loopBind: LoopBindFrame['type'] = 'LoopBind'
    const _loopBindComplete: LoopBindCompleteFrame['type'] = 'LoopBindComplete'
    const _loopIterate: LoopIterateFrame['type'] = 'LoopIterate'
    const _forLoop: ForLoopFrame['type'] = 'ForLoop'
    const _forElementBindComplete: ForElementBindCompleteFrame['type'] = 'ForElementBindComplete'
    const _forLetBind: ForLetBindFrame['type'] = 'ForLetBind'
    const _recur: RecurFrame['type'] = 'Recur'
    const _recurLoopRebind: RecurLoopRebindFrame['type'] = 'RecurLoopRebind'
    const _performArgs: PerformArgsFrame['type'] = 'PerformArgs'
    const _tryWith: TryWithFrame['type'] = 'TryWith'
    const _effectRef: EffectRefFrame['type'] = 'EffectRef'
    const _handlerInvoke: HandlerInvokeFrame['type'] = 'HandlerInvoke'
    const _complement: ComplementFrame['type'] = 'Complement'
    const _comp: CompFrame['type'] = 'Comp'
    const _juxt: JuxtFrame['type'] = 'Juxt'
    const _everyPred: EveryPredFrame['type'] = 'EveryPred'
    const _somePred: SomePredFrame['type'] = 'SomePred'
    const _effectResume: EffectResumeFrame['type'] = 'EffectResume'
    const _parallelResume: ParallelResumeFrame['type'] = 'ParallelResume'
    const _evalArgs: EvalArgsFrame['type'] = 'EvalArgs'
    const _callFn: CallFnFrame['type'] = 'CallFn'
    const _fnBody: FnBodyFrame['type'] = 'FnBody'
    const _fnArgBind: FnArgBindFrame['type'] = 'FnArgBind'
    const _fnArgSlotComplete: FnArgSlotCompleteFrame['type'] = 'FnArgSlotComplete'
    const _fnRestArgComplete: FnRestArgCompleteFrame['type'] = 'FnRestArgComplete'
    const _bindingSlot: BindingSlotFrame['type'] = 'BindingSlot'
    const _nanCheck: NanCheckFrame['type'] = 'NanCheck'
    const _autoCheckpoint: AutoCheckpointFrame['type'] = 'AutoCheckpoint'

    // All type assignments above are verified by TypeScript at compile time.
    // If any type field doesn't match, compilation fails.
    expect(_sequence).toBe('Sequence')
    expect(_ifBranch).toBe('IfBranch')
    expect(_cond).toBe('Cond')
    expect(_match).toBe('Match')
    expect(_and).toBe('And')
    expect(_or).toBe('Or')
    expect(_qq).toBe('Qq')
    expect(_arrayBuild).toBe('ArrayBuild')
    expect(_objectBuild).toBe('ObjectBuild')
    expect(_letBind).toBe('LetBind')
    expect(_letBindComplete).toBe('LetBindComplete')
    expect(_loopBind).toBe('LoopBind')
    expect(_loopBindComplete).toBe('LoopBindComplete')
    expect(_loopIterate).toBe('LoopIterate')
    expect(_forLoop).toBe('ForLoop')
    expect(_forElementBindComplete).toBe('ForElementBindComplete')
    expect(_forLetBind).toBe('ForLetBind')
    expect(_recur).toBe('Recur')
    expect(_recurLoopRebind).toBe('RecurLoopRebind')
    expect(_performArgs).toBe('PerformArgs')
    expect(_tryWith).toBe('TryWith')
    expect(_effectRef).toBe('EffectRef')
    expect(_handlerInvoke).toBe('HandlerInvoke')
    expect(_complement).toBe('Complement')
    expect(_comp).toBe('Comp')
    expect(_juxt).toBe('Juxt')
    expect(_everyPred).toBe('EveryPred')
    expect(_somePred).toBe('SomePred')
    expect(_effectResume).toBe('EffectResume')
    expect(_parallelResume).toBe('ParallelResume')
    expect(_evalArgs).toBe('EvalArgs')
    expect(_callFn).toBe('CallFn')
    expect(_fnBody).toBe('FnBody')
    expect(_fnArgBind).toBe('FnArgBind')
    expect(_fnArgSlotComplete).toBe('FnArgSlotComplete')
    expect(_fnRestArgComplete).toBe('FnRestArgComplete')
    expect(_bindingSlot).toBe('BindingSlot')
    expect(_nanCheck).toBe('NanCheck')
    expect(_autoCheckpoint).toBe('AutoCheckpoint')
  })
})
