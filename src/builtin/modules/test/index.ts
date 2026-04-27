import type { BuiltinNormalExpressions } from '../../../builtin/interface'
import { TypeError } from '../../../errors'
import type { Any } from '../../../interface'
import { assertString } from '../../../typeGuards/string'
import { isDvalaFunction } from '../../../typeGuards/dvalaFunction'
import type { DvalaModule } from '../interface'
import testModuleSource from './test.dvala'
import { moduleDocs } from './docs'

// --- Test collector types ---

export interface TestEntry {
  /** Full test name including describe group prefixes, separated by ' > ' */
  fullName: string
  /** The test body function to execute */
  body: Any
  /** Whether the test is skipped */
  skip: boolean
}

/**
 * A TestCollector accumulates test registrations during evaluation of a .test.dvala file.
 * The runner creates a collector, passes it to createTestModule(), and reads the
 * collected tests after evaluation completes.
 */
interface TestCollector {
  tests: TestEntry[]
  /** Stack of describe group names for nested describe blocks */
  describeStack: string[]
  /** Depth of #skip nesting — tests registered while > 0 are automatically skipped */
  skipDepth: number
}

export function createTestCollector(): TestCollector {
  return {
    tests: [],
    describeStack: [],
    skipDepth: 0,
  }
}

/**
 * Creates a test module bound to a specific collector.
 * Each .test.dvala file gets its own collector + module instance,
 * so test registrations are isolated per file.
 */
export function createTestModule(collector: TestCollector): DvalaModule {
  const fullName = (name: string): string => {
    return [...collector.describeStack, name].join(' > ')
  }

  const testNormalExpressions: BuiltinNormalExpressions = {
    test: {
      evaluate: ([name, body], sourceCodeInfo): null => {
        assertString(name, sourceCodeInfo)
        if (!isDvalaFunction(body)) {
          throw new TypeError('Second argument to test must be a function', sourceCodeInfo ?? undefined)
        }
        collector.tests.push({
          fullName: fullName(name),
          body,
          skip: collector.skipDepth > 0,
        })
        return null
      },
      arity: { min: 2, max: 2 },
    },
    // describe is implemented in test.dvala — it calls _pushDescribe, body(), _popDescribe
    describe: {
      /* v8 ignore next 1 */
      evaluate: () => null,
      arity: { min: 2, max: 2 },
    },
    // skip is implemented as a macro in test.dvala — wraps expressions in pushSkip/popSkip effects
  }

  for (const [key, docs] of Object.entries(moduleDocs)) {
    if (testNormalExpressions[key]) testNormalExpressions[key].docs = docs
  }

  return {
    name: 'test',
    description: 'Lightweight test framework with describe, it, and assertion helpers.',
    functions: testNormalExpressions,
    source: testModuleSource,
    docs: moduleDocs,
  }
}
