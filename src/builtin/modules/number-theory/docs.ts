import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'abundantSeq': {
    category: 'numberTheory',
    description: 'Generates the abundant numbers up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { abundantSeq } = import("numberTheory");\nabundantSeq(1)',
      'let { abundantSeq } = import("numberTheory");\nabundantSeq(5)',
    ],
    seeAlso: ['numberTheory.abundantNth', 'numberTheory.abundantTakeWhile', 'numberTheory.isAbundant', 'numberTheory.deficientSeq', 'numberTheory.perfectSeq'],
  },
  'abundantTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the abundant numbers while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { abundantTakeWhile } = import("numberTheory");\nabundantTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['numberTheory.abundantSeq', 'numberTheory.abundantNth', 'numberTheory.isAbundant'],
  },
  'abundantNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the abundant numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the number in the sequence.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { abundantNth } = import("numberTheory");\nabundantNth(1)',
      'let { abundantNth } = import("numberTheory");\nabundantNth(5)',
    ],
    seeAlso: ['numberTheory.abundantSeq', 'numberTheory.abundantTakeWhile', 'numberTheory.isAbundant'],
  },
  'isAbundant': {
    category: 'numberTheory',
    description: 'Checks if a number is abundant.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isAbundant } = import("numberTheory");\nisAbundant(12)',
      'let { isAbundant } = import("numberTheory");\nisAbundant(15)',
    ],
    seeAlso: ['numberTheory.abundantSeq', 'numberTheory.abundantNth', 'numberTheory.isDeficient', 'numberTheory.isPerfect', 'numberTheory.sigma', 'numberTheory.divisors', 'numberTheory.abundantTakeWhile'],
  },
  'arithmeticSeq': {
    category: 'numberTheory',
    description: 'Generates the arithmetic sequence for a given `start`, `step`, and `length`.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      step: {
        type: 'number',
        description: 'The common difference of the sequence.',
      },
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'step',
          'length',
        ],
      },
    ],
    examples: [
      'let { arithmeticSeq } = import("numberTheory");\narithmeticSeq(3, 2, 2)',
      'let { arithmeticSeq } = import("numberTheory");\narithmeticSeq(2, 3, 2)',
      'let { arithmeticSeq } = import("numberTheory");\narithmeticSeq(1, 2, 2)',
      'let { arithmeticSeq } = import("numberTheory");\narithmeticSeq(1, 1.5, 12)',
    ],
    seeAlso: ['numberTheory.arithmeticNth', 'numberTheory.arithmeticTakeWhile', 'numberTheory.isArithmetic', 'numberTheory.geometricSeq'],
  },
  'arithmeticTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the arithmetic sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      step: {
        type: 'number',
        description: 'The common difference of the sequence.',
      },
      takeWhile: {
        type: 'function',
        description: 'A function that takes a number and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'step',
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { arithmeticTakeWhile } = import("numberTheory");\narithmeticTakeWhile(1, 0.25, -> $ < 3)',
    ],
    seeAlso: ['numberTheory.arithmeticSeq', 'numberTheory.arithmeticNth', 'numberTheory.isArithmetic'],
  },
  'arithmeticNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the arithmetic sequence.',
    returns: {
      type: 'number',
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      step: {
        type: 'number',
        description: 'The common difference of the sequence.',
      },
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'step',
          'n',
        ],
      },
    ],
    examples: [
      'let { arithmeticNth } = import("numberTheory");\narithmeticNth(3, 2, 2)',
      'let { arithmeticNth } = import("numberTheory");\narithmeticNth(2, 3, 2)',
      'let { arithmeticNth } = import("numberTheory");\narithmeticNth(1, 2, 2)',
      'let { arithmeticNth } = import("numberTheory");\narithmeticNth(1, 1.5, 12)',
    ],
    seeAlso: ['numberTheory.arithmeticSeq', 'numberTheory.arithmeticTakeWhile', 'numberTheory.isArithmetic'],
  },
  'isArithmetic': {
    category: 'numberTheory',
    description: 'Checks if a number is part of the arithmetic sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      step: {
        type: 'number',
        description: 'The common difference of the sequence.',
      },
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'step',
          'n',
        ],
      },
    ],
    examples: [
      'let { isArithmetic } = import("numberTheory");\nisArithmetic(3, 2, 2)',
      'let { isArithmetic } = import("numberTheory");\nisArithmetic(2, 3, 2)',
      'let { isArithmetic } = import("numberTheory");\nisArithmetic(1, 2, 2)',
      'let { isArithmetic } = import("numberTheory");\nisArithmetic(1, 1.5, 12)',
    ],
    seeAlso: ['numberTheory.arithmeticSeq', 'numberTheory.arithmeticNth', 'numberTheory.isGeometric', 'numberTheory.arithmeticTakeWhile'],
  },
  'bellSeq': {
    category: 'numberTheory',
    description: 'Generates the Bell sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 22 (the maximum length of the pre-calculated bell numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { bellSeq } = import("numberTheory");\nbellSeq(5)',
      'let { bellSeq } = import("numberTheory");\nbellSeq(10)',
      'let { bellSeq } = import("numberTheory");\nbellSeq()',
    ],
    seeAlso: ['numberTheory.bellNth', 'numberTheory.bellTakeWhile', 'numberTheory.isBell', 'numberTheory.catalanSeq', 'numberTheory.stirlingSecond', 'numberTheory.stirlingFirst'],
  },
  'bellTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Bell sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { bellTakeWhile } = import("numberTheory");\nbellTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.bellSeq', 'numberTheory.bellNth', 'numberTheory.isBell'],
  },
  'bellNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Bell sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { bellNth } = import("numberTheory");\nbellNth(5)',
      'let { bellNth } = import("numberTheory");\nbellNth(10)',
    ],
    seeAlso: ['numberTheory.bellSeq', 'numberTheory.bellTakeWhile', 'numberTheory.isBell'],
  },
  'isBell': {
    category: 'numberTheory',
    description: 'Checks if a number is in the Bell sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isBell } = import("numberTheory");\nisBell(1)',
      'let { isBell } = import("numberTheory");\nisBell(27644437)',
      'let { isBell } = import("numberTheory");\nisBell(27644436)',
    ],
    seeAlso: ['numberTheory.bellSeq', 'numberTheory.bellNth', 'numberTheory.isCatalan', 'numberTheory.bellTakeWhile'],
  },
  'bernoulliSeq': {
    category: 'numberTheory',
    description: 'Generates the Bernoulli sequence up to a specified length.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { bernoulliSeq } = import("numberTheory");\nbernoulliSeq(5)',
      'let { bernoulliSeq } = import("numberTheory");\nbernoulliSeq(10)',
    ],
    seeAlso: ['numberTheory.bernoulliNth', 'numberTheory.bernoulliTakeWhile'],
  },
  'bernoulliTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Bernoulli sequence while a condition is met.',
    returns: {
      type: 'number',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { bernoulliTakeWhile } = import("numberTheory");\nbernoulliTakeWhile(-> abs($) < 100)',
    ],
    seeAlso: ['numberTheory.bernoulliSeq', 'numberTheory.bernoulliNth'],
  },
  'bernoulliNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Bernoulli sequence.',
    returns: {
      type: 'number',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { bernoulliNth } = import("numberTheory");\nbernoulliNth(5)',
      'let { bernoulliNth } = import("numberTheory");\nbernoulliNth(10)',
      'let { bernoulliNth } = import("numberTheory");\nbernoulliNth(23)',
    ],
    seeAlso: ['numberTheory.bernoulliSeq', 'numberTheory.bernoulliTakeWhile'],
  },
  'catalanSeq': {
    category: 'numberTheory',
    description: 'Generates the Catalan sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 30 (the maximum length of the pre-calculated catalan numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { catalanSeq } = import("numberTheory");\ncatalanSeq(5)',
      'let { catalanSeq } = import("numberTheory");\ncatalanSeq(10)',
      'let { catalanSeq } = import("numberTheory");\ncatalanSeq()',
    ],
    seeAlso: ['numberTheory.catalanNth', 'numberTheory.catalanTakeWhile', 'numberTheory.isCatalan', 'numberTheory.bellSeq'],
  },
  'catalanTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Catalan sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { catalanTakeWhile } = import("numberTheory");\ncatalanTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.catalanSeq', 'numberTheory.catalanNth', 'numberTheory.isCatalan'],
  },
  'catalanNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Catalan sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { catalanNth } = import("numberTheory");\ncatalanNth(5)',
      'let { catalanNth } = import("numberTheory");\ncatalanNth(10)',
    ],
    seeAlso: ['numberTheory.catalanSeq', 'numberTheory.catalanTakeWhile', 'numberTheory.isCatalan'],
  },
  'isCatalan': {
    category: 'numberTheory',
    description: 'Determines if a number is in the Catalan sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isCatalan } = import("numberTheory");\nisCatalan(5)',
      'let { isCatalan } = import("numberTheory");\nisCatalan(10)',
    ],
    seeAlso: ['numberTheory.catalanSeq', 'numberTheory.catalanNth', 'numberTheory.isBell', 'numberTheory.catalanTakeWhile'],
  },
  'collatzSeq': {
    category: 'numberTheory',
    description: 'Generates the collatz sequence starting from a given integer.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      start: {
        type: 'integer',
        description: 'The starting integer for the collatz sequence.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
        ],
      },
    ],
    examples: [
      'let { collatzSeq } = import("numberTheory");\ncollatzSeq(3)',
      'let { collatzSeq } = import("numberTheory");\ncollatzSeq(11)',
    ],
    seeAlso: ['numberTheory.jugglerSeq'],
  },
  'compositeSeq': {
    category: 'numberTheory',
    description: 'Generates the composite sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { compositeSeq } = import("numberTheory");\ncompositeSeq(1)',
      'let { compositeSeq } = import("numberTheory");\ncompositeSeq(2)',
      'let { compositeSeq } = import("numberTheory");\ncompositeSeq(10)',
    ],
    seeAlso: ['numberTheory.compositeNth', 'numberTheory.compositeTakeWhile', 'numberTheory.isComposite', 'numberTheory.primeSeq'],
  },
  'compositeTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the composite sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { compositeTakeWhile } = import("numberTheory");\ncompositeTakeWhile(-> $ < 50)',
    ],
    seeAlso: ['numberTheory.compositeSeq', 'numberTheory.compositeNth', 'numberTheory.isComposite'],
  },
  'compositeNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the composite sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the composite number to retrieve.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { compositeNth } = import("numberTheory");\ncompositeNth(1)',
      'let { compositeNth } = import("numberTheory");\ncompositeNth(2)',
      'let { compositeNth } = import("numberTheory");\ncompositeNth(10)',
    ],
    seeAlso: ['numberTheory.compositeSeq', 'numberTheory.compositeTakeWhile', 'numberTheory.isComposite'],
  },
  'isComposite': {
    category: 'numberTheory',
    description: 'Determines if a number is composite.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isComposite } = import("numberTheory");\nisComposite(4)',
      'let { isComposite } = import("numberTheory");\nisComposite(5)',
      'let { isComposite } = import("numberTheory");\nisComposite(11)',
    ],
    seeAlso: ['numberTheory.compositeSeq', 'numberTheory.compositeNth', 'numberTheory.isPrime', 'numberTheory.primeFactors', 'numberTheory.compositeTakeWhile'],
  },
  'deficientSeq': {
    category: 'numberTheory',
    description: 'Generates the deficient numbers up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { deficientSeq } = import("numberTheory");\ndeficientSeq(1)',
      'let { deficientSeq } = import("numberTheory");\ndeficientSeq(5)',
    ],
    seeAlso: ['numberTheory.deficientNth', 'numberTheory.deficientTakeWhile', 'numberTheory.isDeficient', 'numberTheory.abundantSeq', 'numberTheory.perfectSeq'],
  },
  'deficientTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the deficient numbers while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { deficientTakeWhile } = import("numberTheory");\ndeficientTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['numberTheory.deficientSeq', 'numberTheory.deficientNth', 'numberTheory.isDeficient'],
  },
  'deficientNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the deficient numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the number in the sequence.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { deficientNth } = import("numberTheory");\ndeficientNth(5)',
      'let { deficientNth } = import("numberTheory");\ndeficientNth(12)',
    ],
    seeAlso: ['numberTheory.deficientSeq', 'numberTheory.deficientTakeWhile', 'numberTheory.isDeficient'],
  },
  'isDeficient': {
    category: 'numberTheory',
    description: 'Checks if a number is deficient.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isDeficient } = import("numberTheory");\nisDeficient(12)',
      'let { isDeficient } = import("numberTheory");\nisDeficient(15)',
    ],
    seeAlso: ['numberTheory.deficientSeq', 'numberTheory.deficientNth', 'numberTheory.isAbundant', 'numberTheory.isPerfect', 'numberTheory.sigma', 'numberTheory.divisors', 'numberTheory.deficientTakeWhile'],
  },
  'factorialSeq': {
    category: 'numberTheory',
    description: 'Generates the factorial sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 19 (the maximum length of the pre-calculated factorial numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { factorialSeq } = import("numberTheory");\nfactorialSeq(1)',
      'let { factorialSeq } = import("numberTheory");\nfactorialSeq(2)',
      'let { factorialSeq } = import("numberTheory");\nfactorialSeq(3)',
      'let { factorialSeq } = import("numberTheory");\nfactorialSeq(4)',
      'let { factorialSeq } = import("numberTheory");\nfactorialSeq(5)',
      'let { factorialSeq } = import("numberTheory");\nfactorialSeq(10)',
    ],
    seeAlso: ['numberTheory.factorialNth', 'numberTheory.factorialTakeWhile', 'numberTheory.isFactorial', 'numberTheory.factorial'],
  },
  'factorialTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the factorial sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { factorialTakeWhile } = import("numberTheory");\nfactorialTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.factorialSeq', 'numberTheory.factorialNth', 'numberTheory.isFactorial'],
  },
  'factorialNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the factorial sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { factorialNth } = import("numberTheory");\nfactorialNth(1)',
      'let { factorialNth } = import("numberTheory");\nfactorialNth(2)',
      'let { factorialNth } = import("numberTheory");\nfactorialNth(3)',
      'let { factorialNth } = import("numberTheory");\nfactorialNth(4)',
      'let { factorialNth } = import("numberTheory");\nfactorialNth(5)',
      'let { factorialNth } = import("numberTheory");\nfactorialNth(10)',
    ],
    seeAlso: ['numberTheory.factorialSeq', 'numberTheory.factorialTakeWhile', 'numberTheory.isFactorial', 'numberTheory.factorial'],
  },
  'isFactorial': {
    category: 'numberTheory',
    description: 'Checks if a number is in the factorial sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isFactorial } = import("numberTheory");\nisFactorial(1)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(2)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(3)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(4)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(5)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(6)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(7)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(8)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(9)',
      'let { isFactorial } = import("numberTheory");\nisFactorial(3628800)',
    ],
    seeAlso: ['numberTheory.factorialSeq', 'numberTheory.factorialNth', 'numberTheory.factorial', 'numberTheory.factorialTakeWhile'],
  },
  'fibonacciSeq': {
    category: 'numberTheory',
    description: 'Generates the fibonacci sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 79 (the maximum length of the pre-calculated Fibonacci numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { fibonacciSeq } = import("numberTheory");\nfibonacciSeq(1)',
      'let { fibonacciSeq } = import("numberTheory");\nfibonacciSeq(2)',
      'let { fibonacciSeq } = import("numberTheory");\nfibonacciSeq()',
    ],
    seeAlso: ['numberTheory.fibonacciNth', 'numberTheory.fibonacciTakeWhile', 'numberTheory.isFibonacci', 'numberTheory.lucasSeq', 'numberTheory.tribonacciSeq', 'numberTheory.pellSeq', 'numberTheory.padovanSeq'],
  },
  'fibonacciTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the fibonacci sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { fibonacciTakeWhile } = import("numberTheory");\nfibonacciTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['numberTheory.fibonacciSeq', 'numberTheory.fibonacciNth', 'numberTheory.isFibonacci'],
  },
  'fibonacciNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the fibonacci sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { fibonacciNth } = import("numberTheory");\nfibonacciNth(5)',
      'let { fibonacciNth } = import("numberTheory");\nfibonacciNth(50)',
    ],
    seeAlso: ['numberTheory.fibonacciSeq', 'numberTheory.fibonacciTakeWhile', 'numberTheory.isFibonacci'],
  },
  'isFibonacci': {
    category: 'numberTheory',
    description: 'Determines if a number is in the fibonacci sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(0)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(1)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(2)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(3)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(4)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(5)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(6)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(7)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(8)',
      'let { isFibonacci } = import("numberTheory");\nisFibonacci(9)',
    ],
    seeAlso: ['numberTheory.fibonacciSeq', 'numberTheory.fibonacciNth', 'numberTheory.isLucas', 'numberTheory.fibonacciTakeWhile', 'numberTheory.isTribonacci', 'numberTheory.isPadovan', 'numberTheory.isPell'],
  },
  'geometricSeq': {
    category: 'numberTheory',
    description: 'Generates the geometric sequence for a given `start`, `ratio`, and `length`.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      ratio: {
        type: 'number',
        description: 'The common ratio of the sequence.',
      },
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'ratio',
          'length',
        ],
      },
    ],
    examples: [
      'let { geometricSeq } = import("numberTheory");\ngeometricSeq(3, 2, 2)',
      'let { geometricSeq } = import("numberTheory");\ngeometricSeq(2, 3, 2)',
      'let { geometricSeq } = import("numberTheory");\ngeometricSeq(1, 2, 2)',
      'let { geometricSeq } = import("numberTheory");\ngeometricSeq(1, 1.5, 12)',
    ],
    seeAlso: ['numberTheory.geometricNth', 'numberTheory.geometricTakeWhile', 'numberTheory.isGeometric', 'numberTheory.arithmeticSeq'],
  },
  'geometricTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the geometric sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      ratio: {
        type: 'number',
        description: 'The common ratio of the sequence.',
      },
      takeWhile: {
        type: 'function',
        description: 'A function that takes a number and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'ratio',
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { geometricTakeWhile } = import("numberTheory");\ngeometricTakeWhile(1, 1.5, -> $ < 10)',
    ],
    seeAlso: ['numberTheory.geometricSeq', 'numberTheory.geometricNth', 'numberTheory.isGeometric'],
  },
  'geometricNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the geometric sequence.',
    returns: {
      type: 'number',
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      ratio: {
        type: 'number',
        description: 'The common ratio of the sequence.',
      },
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'ratio',
          'n',
        ],
      },
    ],
    examples: [
      'let { geometricNth } = import("numberTheory");\ngeometricNth(3, 2, 2)',
      'let { geometricNth } = import("numberTheory");\ngeometricNth(2, 3, 2)',
      'let { geometricNth } = import("numberTheory");\ngeometricNth(1, 2, 2)',
      'let { geometricNth } = import("numberTheory");\ngeometricNth(1, 1.5, 4)',
    ],
    seeAlso: ['numberTheory.geometricSeq', 'numberTheory.geometricTakeWhile', 'numberTheory.isGeometric'],
  },
  'isGeometric': {
    category: 'numberTheory',
    description: 'Checks if a number is in the geometric sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      start: {
        type: 'number',
        description: 'The starting term of the sequence.',
      },
      ratio: {
        type: 'number',
        description: 'The common ratio of the sequence.',
      },
      n: {
        type: 'number',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
          'ratio',
          'n',
        ],
      },
    ],
    examples: [
      'let { isGeometric } = import("numberTheory");\nisGeometric(1, 2, 1)',
      'let { isGeometric } = import("numberTheory");\nisGeometric(2, 3, 2)',
      'let { isGeometric } = import("numberTheory");\nisGeometric(3, 2, 2)',
      'let { isGeometric } = import("numberTheory");\nisGeometric(1, 1.5, 2.25)',
      'let { isGeometric } = import("numberTheory");\nisGeometric(1, 1.5, -4)',
    ],
    seeAlso: ['numberTheory.geometricSeq', 'numberTheory.geometricNth', 'numberTheory.isArithmetic', 'numberTheory.geometricTakeWhile'],
  },
  'golombSeq': {
    category: 'numberTheory',
    description: 'Generates the Golomb sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { golombSeq } = import("numberTheory");\ngolombSeq(5)',
      'let { golombSeq } = import("numberTheory");\ngolombSeq(20)',
    ],
    seeAlso: ['numberTheory.golombNth', 'numberTheory.golombTakeWhile', 'numberTheory.isGolomb', 'numberTheory.recamanSeq'],
  },
  'golombTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Golomb sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { golombTakeWhile } = import("numberTheory");\ngolombTakeWhile(-> $ <= 10)',
    ],
    seeAlso: ['numberTheory.golombSeq', 'numberTheory.golombNth', 'numberTheory.isGolomb'],
  },
  'golombNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Golomb sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { golombNth } = import("numberTheory");\ngolombNth(5)',
      'let { golombNth } = import("numberTheory");\ngolombNth(1000)',
    ],
    seeAlso: ['numberTheory.golombSeq', 'numberTheory.golombTakeWhile', 'numberTheory.isGolomb'],
  },
  'isGolomb': {
    category: 'numberTheory',
    description: 'Checks if a number is in the Golomb sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isGolomb } = import("numberTheory");\nisGolomb(1)',
      'let { isGolomb } = import("numberTheory");\nisGolomb(2)',
      'let { isGolomb } = import("numberTheory");\nisGolomb(3345)',
      'let { isGolomb } = import("numberTheory");\nisGolomb(67867864)',
    ],
    seeAlso: ['numberTheory.golombSeq', 'numberTheory.golombNth', 'numberTheory.golombTakeWhile'],
  },
  'happySeq': {
    category: 'numberTheory',
    description: 'Generates the happy sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { happySeq } = import("numberTheory");\nhappySeq(1)',
      'let { happySeq } = import("numberTheory");\nhappySeq(2)',
      'let { happySeq } = import("numberTheory");\nhappySeq(20)',
    ],
    seeAlso: ['numberTheory.happyNth', 'numberTheory.happyTakeWhile', 'numberTheory.isHappy', 'numberTheory.luckySeq'],
  },
  'happyTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the happy sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { happyTakeWhile } = import("numberTheory");\nhappyTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['numberTheory.happySeq', 'numberTheory.happyNth', 'numberTheory.isHappy'],
  },
  'happyNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the happy sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the happy number to return.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { happyNth } = import("numberTheory");\nhappyNth(1)',
      'let { happyNth } = import("numberTheory");\nhappyNth(2)',
      'let { happyNth } = import("numberTheory");\nhappyNth(20)',
    ],
    seeAlso: ['numberTheory.happySeq', 'numberTheory.happyTakeWhile', 'numberTheory.isHappy'],
  },
  'isHappy': {
    category: 'numberTheory',
    description: 'Determines if a number is a happy number.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isHappy } = import("numberTheory");\nisHappy(1)',
      'let { isHappy } = import("numberTheory");\nisHappy(2)',
      'let { isHappy } = import("numberTheory");\nisHappy(100)',
    ],
    seeAlso: ['numberTheory.happySeq', 'numberTheory.happyNth', 'numberTheory.happyTakeWhile'],
  },
  'jugglerSeq': {
    category: 'numberTheory',
    description: 'Generates the Juggler sequence starting from a given integer.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      start: {
        type: 'integer',
        description: 'The starting integer for the Juggler sequence.',
      },
    },
    variants: [
      {
        argumentNames: [
          'start',
        ],
      },
    ],
    examples: [
      'let { jugglerSeq } = import("numberTheory");\njugglerSeq(3)',
      'let { jugglerSeq } = import("numberTheory");\njugglerSeq(5)',
    ],
    seeAlso: ['numberTheory.collatzSeq'],
  },
  'lookAndSaySeq': {
    category: 'numberTheory',
    description: 'Generates the Look-and-Say sequence up to a specified length.',
    returns: {
      type: 'string',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { lookAndSaySeq } = import("numberTheory");\nlookAndSaySeq(5)',
    ],
    seeAlso: ['numberTheory.lookAndSayNth', 'numberTheory.lookAndSayTakeWhile', 'numberTheory.isLookAndSay'],
  },
  'lookAndSayTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Look-and-Say sequence while a condition is met.',
    returns: {
      type: 'string',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes a string and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { lookAndSayTakeWhile } = import("numberTheory");\nlookAndSayTakeWhile((term, index) -> count(term) < 10)',
      'let { lookAndSayTakeWhile } = import("numberTheory");\nlookAndSayTakeWhile(-> $2 <= 10)',
    ],
    seeAlso: ['numberTheory.lookAndSaySeq', 'numberTheory.lookAndSayNth', 'numberTheory.isLookAndSay'],
  },
  'lookAndSayNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Look-and-Say sequence.',
    returns: {
      type: 'string',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term in the sequence.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { lookAndSayNth } = import("numberTheory");\nlookAndSayNth(5)',
    ],
    seeAlso: ['numberTheory.lookAndSaySeq', 'numberTheory.lookAndSayTakeWhile', 'numberTheory.isLookAndSay'],
  },
  'isLookAndSay': {
    category: 'numberTheory',
    description: 'Checks if a string is a valid Look-and-Say term.',
    returns: {
      type: 'boolean',
    },
    args: {
      term: {
        type: 'string',
        description: 'The term to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'term',
        ],
      },
    ],
    examples: [
      'let { isLookAndSay } = import("numberTheory");\nisLookAndSay("111221")',
      'let { isLookAndSay } = import("numberTheory");\nisLookAndSay("123")',
    ],
    seeAlso: ['numberTheory.lookAndSaySeq', 'numberTheory.lookAndSayNth', 'numberTheory.lookAndSayTakeWhile'],
  },
  'lucasSeq': {
    category: 'numberTheory',
    description: 'Generates the lucas sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 77 (the maximum length of the pre-calculated Lucas numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { lucasSeq } = import("numberTheory");\nlucasSeq(1)',
      'let { lucasSeq } = import("numberTheory");\nlucasSeq(2)',
      'let { lucasSeq } = import("numberTheory");\nlucasSeq()',
    ],
    seeAlso: ['numberTheory.lucasNth', 'numberTheory.lucasTakeWhile', 'numberTheory.isLucas', 'numberTheory.fibonacciSeq'],
  },
  'lucasTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the lucas sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { lucasTakeWhile } = import("numberTheory");\nlucasTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['numberTheory.lucasSeq', 'numberTheory.lucasNth', 'numberTheory.isLucas'],
  },
  'lucasNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the lucas sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { lucasNth } = import("numberTheory");\nlucasNth(1)',
      'let { lucasNth } = import("numberTheory");\nlucasNth(2)',
      'let { lucasNth } = import("numberTheory");\nlucasNth(10)',
    ],
    seeAlso: ['numberTheory.lucasSeq', 'numberTheory.lucasTakeWhile', 'numberTheory.isLucas'],
  },
  'isLucas': {
    category: 'numberTheory',
    description: 'Determines if a number is in the lucas sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isLucas } = import("numberTheory");\nisLucas(1)',
      'let { isLucas } = import("numberTheory");\nisLucas(2)',
      'let { isLucas } = import("numberTheory");\nisLucas(10)',
    ],
    seeAlso: ['numberTheory.lucasSeq', 'numberTheory.lucasNth', 'numberTheory.isFibonacci', 'numberTheory.lucasTakeWhile'],
  },
  'luckySeq': {
    category: 'numberTheory',
    description: 'Generates the lucky sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { luckySeq } = import("numberTheory");\nluckySeq(1)',
      'let { luckySeq } = import("numberTheory");\nluckySeq(2)',
      'let { luckySeq } = import("numberTheory");\nluckySeq(20)',
    ],
    seeAlso: ['numberTheory.luckyNth', 'numberTheory.luckyTakeWhile', 'numberTheory.isLucky', 'numberTheory.happySeq', 'numberTheory.primeSeq'],
  },
  'luckyTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the lucky sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { luckyTakeWhile } = import("numberTheory");\nluckyTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['numberTheory.luckySeq', 'numberTheory.luckyNth', 'numberTheory.isLucky'],
  },
  'luckyNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the lucky sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The position in the sequence.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { luckyNth } = import("numberTheory");\nluckyNth(1)',
      'let { luckyNth } = import("numberTheory");\nluckyNth(2)',
      'let { luckyNth } = import("numberTheory");\nluckyNth(20)',
    ],
    seeAlso: ['numberTheory.luckySeq', 'numberTheory.luckyTakeWhile', 'numberTheory.isLucky'],
  },
  'isLucky': {
    category: 'numberTheory',
    description: 'Checks if a number is a lucky number.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isLucky } = import("numberTheory");\nisLucky(4)',
      'let { isLucky } = import("numberTheory");\nisLucky(7)',
      'let { isLucky } = import("numberTheory");\nisLucky(33)',
    ],
    seeAlso: ['numberTheory.luckySeq', 'numberTheory.luckyNth', 'numberTheory.isPrime', 'numberTheory.luckyTakeWhile'],
  },
  'mersenneSeq': {
    category: 'numberTheory',
    description: 'Generates the Mersenne sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 9 (the maximum length of the pre-calculated mersenne numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { mersenneSeq } = import("numberTheory");\nmersenneSeq(1)',
      'let { mersenneSeq } = import("numberTheory");\nmersenneSeq(5)',
      'let { mersenneSeq } = import("numberTheory");\nmersenneSeq()',
    ],
    seeAlso: ['numberTheory.mersenneNth', 'numberTheory.mersenneTakeWhile', 'numberTheory.isMersenne', 'numberTheory.primeSeq'],
  },
  'mersenneTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Mersenne sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { mersenneTakeWhile } = import("numberTheory");\nmersenneTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.mersenneSeq', 'numberTheory.mersenneNth', 'numberTheory.isMersenne'],
  },
  'mersenneNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Mersenne sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { mersenneNth } = import("numberTheory");\nmersenneNth(1)',
      'let { mersenneNth } = import("numberTheory");\nmersenneNth(5)',
    ],
    seeAlso: ['numberTheory.mersenneSeq', 'numberTheory.mersenneTakeWhile', 'numberTheory.isMersenne'],
  },
  'isMersenne': {
    category: 'numberTheory',
    description: 'Checks if a number is in the Mersenne sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isMersenne } = import("numberTheory");\nisMersenne(3)',
      'let { isMersenne } = import("numberTheory");\nisMersenne(4)',
      'let { isMersenne } = import("numberTheory");\nisMersenne(7)',
    ],
    seeAlso: ['numberTheory.mersenneSeq', 'numberTheory.mersenneNth', 'numberTheory.isPrime', 'numberTheory.mersenneTakeWhile'],
  },
  'padovanSeq': {
    category: 'numberTheory',
    description: 'Generates the Padovan sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { padovanSeq } = import("numberTheory");\npadovanSeq(5)',
      'let { padovanSeq } = import("numberTheory");\npadovanSeq(10)',
      'let { padovanSeq } = import("numberTheory");\npadovanSeq(20)',
    ],
    seeAlso: ['numberTheory.padovanNth', 'numberTheory.padovanTakeWhile', 'numberTheory.isPadovan', 'numberTheory.fibonacciSeq'],
  },
  'padovanTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Padovan sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { padovanTakeWhile } = import("numberTheory");\npadovanTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.padovanSeq', 'numberTheory.padovanNth', 'numberTheory.isPadovan'],
  },
  'padovanNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Padovan sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { padovanNth } = import("numberTheory");\npadovanNth(5)',
      'let { padovanNth } = import("numberTheory");\npadovanNth(10)',
      'let { padovanNth } = import("numberTheory");\npadovanNth(20)',
    ],
    seeAlso: ['numberTheory.padovanSeq', 'numberTheory.padovanTakeWhile', 'numberTheory.isPadovan'],
  },
  'isPadovan': {
    category: 'numberTheory',
    description: 'Checks if a number is in the Padovan sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPadovan } = import("numberTheory");\nisPadovan(1)',
      'let { isPadovan } = import("numberTheory");\nisPadovan(265)',
      'let { isPadovan } = import("numberTheory");\nisPadovan(6)',
    ],
    seeAlso: ['numberTheory.padovanSeq', 'numberTheory.padovanNth', 'numberTheory.isFibonacci', 'numberTheory.padovanTakeWhile'],
  },
  'partitionSeq': {
    category: 'numberTheory',
    description: 'Generates the partition numbers up to a specified length. If no length is provided, it defaults to 299 (the maximum length of the pre-calculated partition numbers).',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { partitionSeq } = import("numberTheory");\npartitionSeq(1)',
      'let { partitionSeq } = import("numberTheory");\npartitionSeq(10)',
      'let { partitionSeq } = import("numberTheory");\npartitionSeq()',
    ],
    seeAlso: ['numberTheory.partitionNth', 'numberTheory.partitionTakeWhile', 'numberTheory.isPartition', 'numberTheory.partitions', 'numberTheory.countPartitions'],
  },
  'partitionTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the partition numbers while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { partitionTakeWhile } = import("numberTheory");\npartitionTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.partitionSeq', 'numberTheory.partitionNth', 'numberTheory.isPartition'],
  },
  'partitionNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the partition numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the partition number to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { partitionNth } = import("numberTheory");\npartitionNth(1)',
      'let { partitionNth } = import("numberTheory");\npartitionNth(5)',
    ],
    seeAlso: ['numberTheory.partitionSeq', 'numberTheory.partitionTakeWhile', 'numberTheory.isPartition'],
  },
  'isPartition': {
    category: 'numberTheory',
    description: 'Checks if a number is in the partition numbers.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPartition } = import("numberTheory");\nisPartition(0)',
      'let { isPartition } = import("numberTheory");\nisPartition(1)',
      'let { isPartition } = import("numberTheory");\nisPartition(2)',
      'let { isPartition } = import("numberTheory");\nisPartition(3)',
      'let { isPartition } = import("numberTheory");\nisPartition(4)',
      'let { isPartition } = import("numberTheory");\nisPartition(5)',
    ],
    seeAlso: ['numberTheory.partitionSeq', 'numberTheory.partitionNth', 'numberTheory.partitions', 'numberTheory.partitionTakeWhile'],
  },
  'pellSeq': {
    category: 'numberTheory',
    description: 'Generates the Pell sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 42 (the maximum length of the pre-calculated Pell numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { pellSeq } = import("numberTheory");\npellSeq(5)',
      'let { pellSeq } = import("numberTheory");\npellSeq(10)',
      'let { pellSeq } = import("numberTheory");\npellSeq()',
    ],
    seeAlso: ['numberTheory.pellNth', 'numberTheory.pellTakeWhile', 'numberTheory.isPell', 'numberTheory.fibonacciSeq'],
  },
  'pellTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Pell sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { pellTakeWhile } = import("numberTheory");\npellTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.pellSeq', 'numberTheory.pellNth', 'numberTheory.isPell'],
  },
  'pellNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Pell sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { pellNth } = import("numberTheory");\npellNth(5)',
      'let { pellNth } = import("numberTheory");\npellNth(10)',
      'let { pellNth } = import("numberTheory");\npellNth(20)',
    ],
    seeAlso: ['numberTheory.pellSeq', 'numberTheory.pellTakeWhile', 'numberTheory.isPell'],
  },
  'isPell': {
    category: 'numberTheory',
    description: 'Checks if a number is a Pell number.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPell } = import("numberTheory");\nisPell(1)',
      'let { isPell } = import("numberTheory");\nisPell(470832)',
      'let { isPell } = import("numberTheory");\nisPell(10)',
    ],
    seeAlso: ['numberTheory.pellSeq', 'numberTheory.pellNth', 'numberTheory.isFibonacci', 'numberTheory.pellTakeWhile'],
  },
  'perfectSeq': {
    category: 'numberTheory',
    description: 'Generates the perfect numbers up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If no length is provided, it defaults to 7 (the maximum length of the pre-calculated perfect numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { perfectSeq } = import("numberTheory");\nperfectSeq(1)',
      'let { perfectSeq } = import("numberTheory");\nperfectSeq(5)',
      'let { perfectSeq } = import("numberTheory");\nperfectSeq()',
    ],
    seeAlso: ['numberTheory.perfectNth', 'numberTheory.perfectTakeWhile', 'numberTheory.isPerfect', 'numberTheory.abundantSeq', 'numberTheory.deficientSeq', 'numberTheory.isAmicable'],
  },
  'perfectTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the perfect numbers while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { perfectTakeWhile } = import("numberTheory");\nperfectTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['numberTheory.perfectSeq', 'numberTheory.perfectNth', 'numberTheory.isPerfect'],
  },
  'perfectNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the perfect numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the perfect number to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { perfectNth } = import("numberTheory");\nperfectNth(1)',
      'let { perfectNth } = import("numberTheory");\nperfectNth(5)',
    ],
    seeAlso: ['numberTheory.perfectSeq', 'numberTheory.perfectTakeWhile', 'numberTheory.isPerfect'],
  },
  'isPerfect': {
    category: 'numberTheory',
    description: 'Checks if a number is in the perfect numbers.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPerfect } = import("numberTheory");\nisPerfect(0)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(1)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(2)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(3)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(4)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(5)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(6)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(7)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(8)',
      'let { isPerfect } = import("numberTheory");\nisPerfect(9)',
    ],
    seeAlso: ['numberTheory.perfectSeq', 'numberTheory.perfectNth', 'numberTheory.isAbundant', 'numberTheory.isDeficient', 'numberTheory.sigma', 'numberTheory.perfectTakeWhile', 'numberTheory.isAmicable', 'numberTheory.properDivisors'],
  },
  'perfectSquareSeq': {
    category: 'numberTheory',
    description: 'Generates the perfect square numbers up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { perfectSquareSeq } = import("numberTheory");\nperfectSquareSeq(5)',
      'let { perfectSquareSeq } = import("numberTheory");\nperfectSquareSeq(20)',
    ],
    seeAlso: ['numberTheory.perfectSquareNth', 'numberTheory.perfectSquareTakeWhile', 'numberTheory.isPerfectSquare', 'numberTheory.perfectCubeSeq', 'numberTheory.perfectPowerSeq', 'numberTheory.polygonalSeq'],
  },
  'perfectSquareTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the perfect square numbers while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { perfectSquareTakeWhile } = import("numberTheory");\nperfectSquareTakeWhile(-> $ <= 100)',
    ],
    seeAlso: ['numberTheory.perfectSquareSeq', 'numberTheory.perfectSquareNth', 'numberTheory.isPerfectSquare'],
  },
  'perfectSquareNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the perfect square numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { perfectSquareNth } = import("numberTheory");\nperfectSquareNth(1)',
      'let { perfectSquareNth } = import("numberTheory");\nperfectSquareNth(5)',
    ],
    seeAlso: ['numberTheory.perfectSquareSeq', 'numberTheory.perfectSquareTakeWhile', 'numberTheory.isPerfectSquare'],
  },
  'isPerfectSquare': {
    category: 'numberTheory',
    description: 'Checks if a number is a perfect square.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPerfectSquare } = import("numberTheory");\nisPerfectSquare(16)',
      'let { isPerfectSquare } = import("numberTheory");\nisPerfectSquare(20)',
    ],
    seeAlso: ['numberTheory.perfectSquareSeq', 'numberTheory.perfectSquareNth', 'numberTheory.isPerfectCube', 'numberTheory.isPerfectPower', 'numberTheory.perfectSquareTakeWhile', 'numberTheory.perfectPower', 'numberTheory.isPolygonal'],
  },
  'perfectCubeSeq': {
    category: 'numberTheory',
    description: 'Generates the perfect cube numbers up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { perfectCubeSeq } = import("numberTheory");\nperfectCubeSeq(5)',
      'let { perfectCubeSeq } = import("numberTheory");\nperfectCubeSeq(20)',
    ],
    seeAlso: ['numberTheory.perfectCubeNth', 'numberTheory.perfectCubeTakeWhile', 'numberTheory.isPerfectCube', 'numberTheory.perfectSquareSeq', 'numberTheory.perfectPowerSeq'],
  },
  'perfectCubeTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the perfect cube numbers while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { perfectCubeTakeWhile } = import("numberTheory");\nperfectCubeTakeWhile(-> $ <= 100)',
    ],
    seeAlso: ['numberTheory.perfectCubeSeq', 'numberTheory.perfectCubeNth', 'numberTheory.isPerfectCube'],
  },
  'perfectCubeNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the perfect cube numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { perfectCubeNth } = import("numberTheory");\nperfectCubeNth(1)',
      'let { perfectCubeNth } = import("numberTheory");\nperfectCubeNth(5)',
    ],
    seeAlso: ['numberTheory.perfectCubeSeq', 'numberTheory.perfectCubeTakeWhile', 'numberTheory.isPerfectCube'],
  },
  'isPerfectCube': {
    category: 'numberTheory',
    description: 'Checks if a number is in the perfect cube numbers.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPerfectCube } = import("numberTheory");\nisPerfectCube(7)',
      'let { isPerfectCube } = import("numberTheory");\nisPerfectCube(8)',
      'let { isPerfectCube } = import("numberTheory");\nisPerfectCube(9)',
    ],
    seeAlso: ['numberTheory.perfectCubeSeq', 'numberTheory.perfectCubeNth', 'numberTheory.isPerfectSquare', 'numberTheory.isPerfectPower', 'numberTheory.perfectCubeTakeWhile', 'numberTheory.perfectPower'],
  },
  'perfectPowerSeq': {
    category: 'numberTheory',
    description: 'Generates the perfect power numbers up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { perfectPowerSeq } = import("numberTheory");\nperfectPowerSeq(5)',
      'let { perfectPowerSeq } = import("numberTheory");\nperfectPowerSeq(20)',
    ],
    seeAlso: ['numberTheory.perfectPowerNth', 'numberTheory.perfectPowerTakeWhile', 'numberTheory.isPerfectPower', 'numberTheory.perfectPower', 'numberTheory.perfectSquareSeq', 'numberTheory.perfectCubeSeq'],
  },
  'perfectPowerTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the perfect power numbers while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { perfectPowerTakeWhile } = import("numberTheory");\nperfectPowerTakeWhile(-> $ <= 100)',
    ],
    seeAlso: ['numberTheory.perfectPowerSeq', 'numberTheory.perfectPowerNth', 'numberTheory.isPerfectPower'],
  },
  'perfectPowerNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the perfect power numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { perfectPowerNth } = import("numberTheory");\nperfectPowerNth(3)',
      'let { perfectPowerNth } = import("numberTheory");\nperfectPowerNth(15)',
    ],
    seeAlso: ['numberTheory.perfectPowerSeq', 'numberTheory.perfectPowerTakeWhile', 'numberTheory.isPerfectPower'],
  },
  'isPerfectPower': {
    category: 'numberTheory',
    description: 'Checks if a number is in the perfect power numbers.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPerfectPower } = import("numberTheory");\nisPerfectPower(7)',
      'let { isPerfectPower } = import("numberTheory");\nisPerfectPower(8)',
      'let { isPerfectPower } = import("numberTheory");\nisPerfectPower(9)',
      'let { isPerfectPower } = import("numberTheory");\nisPerfectPower(10)',
    ],
    seeAlso: ['numberTheory.perfectPowerSeq', 'numberTheory.perfectPowerNth', 'numberTheory.perfectPower', 'numberTheory.isPerfectSquare', 'numberTheory.isPerfectCube', 'numberTheory.perfectPowerTakeWhile'],
  },
  'polygonalSeq': {
    category: 'numberTheory',
    description: 'Generates the polygonal sequence for a given number of sides and length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      sides: {
        type: 'integer',
        description: 'The number of sides of the polygon.',
      },
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'sides',
          'length',
        ],
      },
    ],
    examples: [
      'let { polygonalSeq } = import("numberTheory");\npolygonalSeq(3, 2)',
      'let { polygonalSeq } = import("numberTheory");\npolygonalSeq(4, 2)',
      'let { polygonalSeq } = import("numberTheory");\npolygonalSeq(5, 3)',
      'let { polygonalSeq } = import("numberTheory");\npolygonalSeq(6, 5)',
      'let { polygonalSeq } = import("numberTheory");\npolygonalSeq(100, 10)',
    ],
    seeAlso: ['numberTheory.polygonalNth', 'numberTheory.polygonalTakeWhile', 'numberTheory.isPolygonal', 'numberTheory.perfectSquareSeq'],
  },
  'polygonalTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the polygonal sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      sides: {
        type: 'integer',
        description: 'The number of sides of the polygon.',
      },
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
      a: {
        type: 'integer',
      },
      b: {
        type: 'function',
      },
    },
    variants: [
      {
        argumentNames: [
          'sides',
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { polygonalTakeWhile } = import("numberTheory");\npolygonalTakeWhile(15, -> $ < 1000)',
    ],
    seeAlso: ['numberTheory.polygonalSeq', 'numberTheory.polygonalNth', 'numberTheory.isPolygonal'],
  },
  'polygonalNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the polygonal sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      sides: {
        type: 'integer',
        description: 'The number of sides of the polygon.',
      },
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'sides',
          'n',
        ],
      },
    ],
    examples: [
      'let { polygonalNth } = import("numberTheory");\npolygonalNth(3, 9)',
      'let { polygonalNth } = import("numberTheory");\npolygonalNth(4, 5)',
      'let { polygonalNth } = import("numberTheory");\npolygonalNth(5, 5)',
    ],
    seeAlso: ['numberTheory.polygonalSeq', 'numberTheory.polygonalTakeWhile', 'numberTheory.isPolygonal'],
  },
  'isPolygonal': {
    category: 'numberTheory',
    description: 'Checks if a number is in the polygonal sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      sides: {
        type: 'integer',
        description: 'The number of sides of the polygon.',
      },
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'sides',
          'n',
        ],
      },
    ],
    examples: [
      'let { isPolygonal } = import("numberTheory");\nisPolygonal(3, 10)',
      'let { isPolygonal } = import("numberTheory");\nisPolygonal(3, 9)',
      'let { isPolygonal } = import("numberTheory");\nisPolygonal(4, 10000)',
      'let { isPolygonal } = import("numberTheory");\nisPolygonal(4, 1000)',
      'let { isPolygonal } = import("numberTheory");\nisPolygonal(6, 45)',
    ],
    seeAlso: ['numberTheory.polygonalSeq', 'numberTheory.polygonalNth', 'numberTheory.isPerfectSquare', 'numberTheory.polygonalTakeWhile'],
  },
  'primeSeq': {
    category: 'numberTheory',
    description: 'Generates the prime sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { primeSeq } = import("numberTheory");\nprimeSeq(1)',
      'let { primeSeq } = import("numberTheory");\nprimeSeq(2)',
      'let { primeSeq } = import("numberTheory");\nprimeSeq(10)',
    ],
    seeAlso: ['numberTheory.primeNth', 'numberTheory.primeTakeWhile', 'numberTheory.isPrime', 'numberTheory.compositeSeq', 'numberTheory.mersenneSeq', 'numberTheory.luckySeq'],
  },
  'primeTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the prime sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { primeTakeWhile } = import("numberTheory");\nprimeTakeWhile(-> $ < 50)',
    ],
    seeAlso: ['numberTheory.primeSeq', 'numberTheory.primeNth', 'numberTheory.isPrime'],
  },
  'primeNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the prime sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { primeNth } = import("numberTheory");\nprimeNth(1)',
      'let { primeNth } = import("numberTheory");\nprimeNth(2)',
      'let { primeNth } = import("numberTheory");\nprimeNth(10)',
    ],
    seeAlso: ['numberTheory.primeSeq', 'numberTheory.primeTakeWhile', 'numberTheory.isPrime'],
  },
  'isPrime': {
    category: 'numberTheory',
    description: 'Determines if a number is prime.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isPrime } = import("numberTheory");\nisPrime(1)',
      'let { isPrime } = import("numberTheory");\nisPrime(2)',
      'let { isPrime } = import("numberTheory");\nisPrime(3)',
      'let { isPrime } = import("numberTheory");\nisPrime(4)',
      'let { isPrime } = import("numberTheory");\nisPrime(997)',
      'let { isPrime } = import("numberTheory");\nisPrime(1001)',
    ],
    seeAlso: ['numberTheory.primeSeq', 'numberTheory.primeNth', 'numberTheory.isComposite', 'numberTheory.primeFactors', 'numberTheory.isMersenne', 'numberTheory.primeTakeWhile', 'numberTheory.isLucky'],
  },
  'recamanSeq': {
    category: 'numberTheory',
    description: 'Generates the Recaman sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { recamanSeq } = import("numberTheory");\nrecamanSeq(5)',
      'let { recamanSeq } = import("numberTheory");\nrecamanSeq(10)',
      'let { recamanSeq } = import("numberTheory");\nrecamanSeq(20)',
    ],
    seeAlso: ['numberTheory.recamanNth', 'numberTheory.recamanTakeWhile', 'numberTheory.isRecaman', 'numberTheory.golombSeq'],
  },
  'recamanTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Recaman sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { recamanTakeWhile } = import("numberTheory");\nrecamanTakeWhile(-> $ < 10)',
    ],
    seeAlso: ['numberTheory.recamanSeq', 'numberTheory.recamanNth', 'numberTheory.isRecaman'],
  },
  'recamanNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Recaman sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { recamanNth } = import("numberTheory");\nrecamanNth(5)',
      'let { recamanNth } = import("numberTheory");\nrecamanNth(10)',
      'let { recamanNth } = import("numberTheory");\nrecamanNth(20)',
    ],
    seeAlso: ['numberTheory.recamanSeq', 'numberTheory.recamanTakeWhile', 'numberTheory.isRecaman'],
  },
  'isRecaman': {
    category: 'numberTheory',
    description: 'Checks if a number is in the Recaman sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isRecaman } = import("numberTheory");\nisRecaman(5)',
      'let { isRecaman } = import("numberTheory");\nisRecaman(10)',
      'let { isRecaman } = import("numberTheory");\nisRecaman(20)',
    ],
    seeAlso: ['numberTheory.recamanSeq', 'numberTheory.recamanNth', 'numberTheory.recamanTakeWhile'],
  },
  'sylvesterSeq': {
    category: 'numberTheory',
    description: 'Generates the Sylvester sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate. If not provided, the default is 6 (the maximum length of the pre-calculated Sylvester numbers).',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
      {
        argumentNames: [],
      },
    ],
    examples: [
      'let { sylvesterSeq } = import("numberTheory");\nsylvesterSeq(5)',
      'let { sylvesterSeq } = import("numberTheory");\nsylvesterSeq()',
      'let { sylvesterSeq } = import("numberTheory");\nsylvesterSeq()',
    ],
    seeAlso: ['numberTheory.sylvesterNth', 'numberTheory.sylvesterTakeWhile', 'numberTheory.isSylvester'],
  },
  'sylvesterTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Sylvester sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { sylvesterTakeWhile } = import("numberTheory");\nsylvesterTakeWhile(-> $ < 100000)',
    ],
    seeAlso: ['numberTheory.sylvesterSeq', 'numberTheory.sylvesterNth', 'numberTheory.isSylvester'],
  },
  'sylvesterNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Sylvester sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { sylvesterNth } = import("numberTheory");\nsylvesterNth(1)',
      'let { sylvesterNth } = import("numberTheory");\nsylvesterNth(5)',
    ],
    seeAlso: ['numberTheory.sylvesterSeq', 'numberTheory.sylvesterTakeWhile', 'numberTheory.isSylvester'],
  },
  'isSylvester': {
    category: 'numberTheory',
    description: 'Checks if a number is in the Sylvester sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isSylvester } = import("numberTheory");\nisSylvester(2)',
      'let { isSylvester } = import("numberTheory");\nisSylvester(3)',
      'let { isSylvester } = import("numberTheory");\nisSylvester(6)',
    ],
    seeAlso: ['numberTheory.sylvesterSeq', 'numberTheory.sylvesterNth', 'numberTheory.sylvesterTakeWhile'],
  },
  'thueMorseSeq': {
    category: 'numberTheory',
    description: 'Generates the Thue-Morse sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { thueMorseSeq } = import("numberTheory");\nthueMorseSeq(5)',
      'let { thueMorseSeq } = import("numberTheory");\nthueMorseSeq(10)',
      'let { thueMorseSeq } = import("numberTheory");\nthueMorseSeq(20)',
    ],
    seeAlso: ['numberTheory.thueMorseNth', 'numberTheory.thueMorseTakeWhile', 'numberTheory.isThueMorse'],
  },
  'thueMorseTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the Thue-Morse sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { thueMorseTakeWhile } = import("numberTheory");\nthueMorseTakeWhile(-> $2 < 10)',
    ],
    seeAlso: ['numberTheory.thueMorseSeq', 'numberTheory.thueMorseNth', 'numberTheory.isThueMorse'],
  },
  'thueMorseNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the Thue-Morse sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term in the sequence.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { thueMorseNth } = import("numberTheory");\nthueMorseNth(5)',
      'let { thueMorseNth } = import("numberTheory");\nthueMorseNth(10)',
      'let { thueMorseNth } = import("numberTheory");\nthueMorseNth(20)',
    ],
    seeAlso: ['numberTheory.thueMorseSeq', 'numberTheory.thueMorseTakeWhile', 'numberTheory.isThueMorse'],
  },
  'isThueMorse': {
    category: 'numberTheory',
    description: 'Checks if a number is part of the Thue-Morse sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isThueMorse } = import("numberTheory");\nisThueMorse(1)',
      'let { isThueMorse } = import("numberTheory");\nisThueMorse(2)',
    ],
    seeAlso: ['numberTheory.thueMorseSeq', 'numberTheory.thueMorseNth', 'numberTheory.thueMorseTakeWhile'],
  },
  'tribonacciSeq': {
    category: 'numberTheory',
    description: 'Generates the tribonacci sequence up to a specified length.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      length: {
        type: 'integer',
        description: 'The length of the sequence to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'length',
        ],
      },
    ],
    examples: [
      'let { tribonacciSeq } = import("numberTheory");\ntribonacciSeq(1)',
      'let { tribonacciSeq } = import("numberTheory");\ntribonacciSeq(2)',
      'let { tribonacciSeq } = import("numberTheory");\ntribonacciSeq(10)',
    ],
    seeAlso: ['numberTheory.tribonacciNth', 'numberTheory.tribonacciTakeWhile', 'numberTheory.isTribonacci', 'numberTheory.fibonacciSeq'],
  },
  'tribonacciTakeWhile': {
    category: 'numberTheory',
    description: 'Generates the tribonacci sequence while a condition is met.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      takeWhile: {
        type: 'function',
        description: 'A function that takes an integer and an index and returns a boolean.',
      },
    },
    variants: [
      {
        argumentNames: [
          'takeWhile',
        ],
      },
    ],
    examples: [
      'let { tribonacciTakeWhile } = import("numberTheory");\ntribonacciTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['numberTheory.tribonacciSeq', 'numberTheory.tribonacciNth', 'numberTheory.isTribonacci'],
  },
  'tribonacciNth': {
    category: 'numberTheory',
    description: 'Generates the nth term of the tribonacci sequence.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The index of the term to generate.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { tribonacciNth } = import("numberTheory");\ntribonacciNth(1)',
      'let { tribonacciNth } = import("numberTheory");\ntribonacciNth(2)',
      'let { tribonacciNth } = import("numberTheory");\ntribonacciNth(10)',
    ],
    seeAlso: ['numberTheory.tribonacciSeq', 'numberTheory.tribonacciTakeWhile', 'numberTheory.isTribonacci'],
  },
  'isTribonacci': {
    category: 'numberTheory',
    description: 'Determines if a number is in the tribonacci sequence.',
    returns: {
      type: 'boolean',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(0)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(1)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(2)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(3)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(4)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(5)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(6)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(7)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(8)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(9)',
      'let { isTribonacci } = import("numberTheory");\nisTribonacci(10)',
    ],
    seeAlso: ['numberTheory.tribonacciSeq', 'numberTheory.tribonacciNth', 'numberTheory.isFibonacci', 'numberTheory.tribonacciTakeWhile'],
  },
  'countCombinations': {
    category: 'numberTheory',
    description: 'Calculates the number of combinations of n items taken k at a time.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { countCombinations } = import("numberTheory");\ncountCombinations(5, 3)',
      'let { countCombinations } = import("numberTheory");\ncountCombinations(10, 2)',
    ],
    seeAlso: ['numberTheory.combinations', 'numberTheory.countPermutations', 'numberTheory.factorial', 'numberTheory.multinomial', 'numberTheory.stirlingSecond', 'numberTheory.countPartitions', 'numberTheory.countPowerSet'],
  },
  'combinations': {
    category: 'numberTheory',
    description: 'Generates all possible combinations of a specified size from a collection.',
    returns: {
      type: 'array',
      array: true,
    },
    args: {
      set: {
        type: 'array',
        array: true,
        description: 'The input collection to generate combinations from.',
      },
      n: {
        type: 'integer',
        description: 'The size of each combination.',
      },
      a: {
        type: 'array',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'set',
          'n',
        ],
      },
    ],
    examples: [
      'let { combinations } = import("numberTheory");\ncombinations([1, 2, 3], 2)',
      'let { combinations } = import("numberTheory");\ncombinations(["a", "b", "c"], 2)',
      'let { combinations } = import("numberTheory");\ncombinations([1, 2, 3], 0)',
      'let { combinations } = import("numberTheory");\ncombinations([1, 2, 3], 1)',
      'let { combinations } = import("numberTheory");\ncombinations([1, 2, 3], 3)',
    ],
    seeAlso: ['numberTheory.countCombinations', 'numberTheory.permutations', 'numberTheory.powerSet', 'numberTheory.cartesianProduct', 'numberTheory.partitions'],
  },
  'countDerangements': {
    category: 'numberTheory',
    description: 'Calculates the number of derangements (permutations where no element appears in its original position) of n items.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The total number of items.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { countDerangements } = import("numberTheory");\ncountDerangements(4)',
      'let { countDerangements } = import("numberTheory");\ncountDerangements(5)',
    ],
    seeAlso: ['numberTheory.derangements', 'numberTheory.countPermutations', 'numberTheory.factorial'],
  },
  'derangements': {
    category: 'numberTheory',
    description: 'Generates all derangements (permutations where no element appears in its original position) of a set.',
    returns: {
      type: 'array',
      array: true,
    },
    args: {
      set: {
        type: 'array',
        array: true,
        description: 'The input collection to generate derangements from.',
      },
    },
    variants: [
      {
        argumentNames: [
          'set',
        ],
      },
    ],
    examples: [
      'let { derangements } = import("numberTheory");\nderangements([1, 2, 3, 4])',
      'let { derangements } = import("numberTheory");\nderangements(["a", "b", "c"])',
    ],
    seeAlso: ['numberTheory.countDerangements', 'numberTheory.permutations'],
  },
  'divisors': {
    category: 'numberTheory',
    description: 'Returns the divisors of a number.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to find divisors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { divisors } = import("numberTheory");\ndivisors(12)',
      'let { divisors } = import("numberTheory");\ndivisors(100)',
      'let { divisors } = import("numberTheory");\ndivisors(37)',
    ],
    seeAlso: ['numberTheory.countDivisors', 'numberTheory.properDivisors', 'numberTheory.sigma', 'numberTheory.primeFactors', 'numberTheory.isDivisibleBy', 'numberTheory.lcm', 'numberTheory.isAbundant', 'numberTheory.isDeficient', 'numberTheory.countProperDivisors'],
  },
  'countDivisors': {
    category: 'numberTheory',
    description: 'Returns the number of divisors of a number.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to count divisors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { countDivisors } = import("numberTheory");\ncountDivisors(12)',
      'let { countDivisors } = import("numberTheory");\ncountDivisors(100)',
      'let { countDivisors } = import("numberTheory");\ncountDivisors(37)',
    ],
    seeAlso: ['numberTheory.divisors', 'numberTheory.countProperDivisors', 'numberTheory.sigma'],
  },
  'properDivisors': {
    category: 'numberTheory',
    description: 'Returns the proper divisors of a number.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to find proper divisors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { properDivisors } = import("numberTheory");\nproperDivisors(12)',
      'let { properDivisors } = import("numberTheory");\nproperDivisors(100)',
      'let { properDivisors } = import("numberTheory");\nproperDivisors(37)',
    ],
    seeAlso: ['numberTheory.countProperDivisors', 'numberTheory.divisors', 'numberTheory.isAmicable', 'numberTheory.isPerfect'],
  },
  'countProperDivisors': {
    category: 'numberTheory',
    description: 'Returns the number of proper divisors of a number.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to count proper divisors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { countProperDivisors } = import("numberTheory");\ncountProperDivisors(12)',
      'let { countProperDivisors } = import("numberTheory");\ncountProperDivisors(100)',
      'let { countProperDivisors } = import("numberTheory");\ncountProperDivisors(37)',
    ],
    seeAlso: ['numberTheory.properDivisors', 'numberTheory.countDivisors', 'numberTheory.divisors'],
  },
  'factorial': {
    category: 'numberTheory',
    description: 'Calculates the factorial of a number.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to calculate the factorial for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { factorial } = import("numberTheory");\nfactorial(5)',
      'let { factorial } = import("numberTheory");\nfactorial(0)',
      'let { factorial } = import("numberTheory");\nfactorial(10)',
      'let { factorial } = import("numberTheory");\nfactorial(20)',
    ],
    seeAlso: ['numberTheory.factorialSeq', 'numberTheory.factorialNth', 'numberTheory.isFactorial', 'numberTheory.countCombinations', 'numberTheory.countPermutations', 'numberTheory.multinomial', 'numberTheory.countDerangements'],
  },
  'partitions': {
    category: 'numberTheory',
    description: 'Generates all partitions of a number.',
    returns: {
      type: 'array',
      array: true,
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to partition.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { partitions } = import("numberTheory");\npartitions(4)',
      'let { partitions } = import("numberTheory");\npartitions(8)',
    ],
    seeAlso: ['numberTheory.countPartitions', 'numberTheory.partitionSeq', 'numberTheory.combinations', 'numberTheory.isPartition'],
  },
  'countPartitions': {
    category: 'numberTheory',
    description: 'Returns the number of partitions of a number.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to count partitions for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { countPartitions } = import("numberTheory");\ncountPartitions(4)',
      'let { countPartitions } = import("numberTheory");\ncountPartitions(8)',
      'let { countPartitions } = import("numberTheory");\ncountPartitions(15)',
    ],
    seeAlso: ['numberTheory.partitions', 'numberTheory.partitionSeq', 'numberTheory.countCombinations'],
  },
  'permutations': {
    category: 'numberTheory',
    description: 'Generates all permutations of a collection.',
    returns: {
      type: 'array',
      array: true,
    },
    args: {
      set: {
        type: 'array',
        array: true,
        description: 'The input collection to generate permutations from.',
      },
    },
    variants: [
      {
        argumentNames: [
          'set',
        ],
      },
    ],
    examples: [
      'let { permutations } = import("numberTheory");\npermutations([1, 2, 3])',
      'let { permutations } = import("numberTheory");\npermutations(["a", "b", "c"])',
      'let { permutations } = import("numberTheory");\npermutations([1, 2, 3, 4])',
      'let { permutations } = import("numberTheory");\npermutations([1, 2])',
      'let { permutations } = import("numberTheory");\npermutations([1])',
      'let { permutations } = import("numberTheory");\npermutations([])',
    ],
    seeAlso: ['numberTheory.countPermutations', 'numberTheory.combinations', 'numberTheory.derangements', 'numberTheory.cartesianProduct'],
  },
  'countPermutations': {
    category: 'numberTheory',
    description: 'Returns the number of permutations of n items taken k at a time.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { countPermutations } = import("numberTheory");\ncountPermutations(5, 3)',
      'let { countPermutations } = import("numberTheory");\ncountPermutations(10, 2)',
      'let { countPermutations } = import("numberTheory");\ncountPermutations(10, 10)',
      'let { countPermutations } = import("numberTheory");\ncountPermutations(10, 0)',
      'let { countPermutations } = import("numberTheory");\ncountPermutations(10, 1)',
    ],
    seeAlso: ['numberTheory.permutations', 'numberTheory.countCombinations', 'numberTheory.factorial', 'numberTheory.multinomial', 'numberTheory.stirlingFirst', 'numberTheory.countDerangements'],
  },
  'powerSet': {
    category: 'numberTheory',
    description: 'Generates the power set of a collection.',
    returns: {
      type: 'array',
      array: true,
    },
    args: {
      set: {
        type: 'any',
        array: true,
        description: 'The input collection to generate the power set from.',
      },
    },
    variants: [
      {
        argumentNames: [
          'set',
        ],
      },
    ],
    examples: [
      'let { powerSet } = import("numberTheory");\npowerSet(["a", "b", "c"])',
      'let { powerSet } = import("numberTheory");\npowerSet([1, 2])',
      'let { powerSet } = import("numberTheory");\npowerSet([1])',
      'let { powerSet } = import("numberTheory");\npowerSet([])',
    ],
    seeAlso: ['numberTheory.countPowerSet', 'numberTheory.combinations', 'numberTheory.cartesianProduct'],
  },
  'countPowerSet': {
    category: 'numberTheory',
    description: 'Returns the number of subsets of a set.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The size of the set.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { countPowerSet } = import("numberTheory");\ncountPowerSet(3)',
      'let { countPowerSet } = import("numberTheory");\ncountPowerSet(5)',
      'let { countPowerSet } = import("numberTheory");\ncountPowerSet(10)',
    ],
    seeAlso: ['numberTheory.powerSet', 'numberTheory.countCombinations'],
  },
  'primeFactors': {
    category: 'numberTheory',
    description: 'Returns the prime factors of a number.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to factor.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { primeFactors } = import("numberTheory");\nprimeFactors(12)',
      'let { primeFactors } = import("numberTheory");\nprimeFactors(100)',
      'let { primeFactors } = import("numberTheory");\nprimeFactors(37)',
    ],
    seeAlso: ['numberTheory.countPrimeFactors', 'numberTheory.distinctPrimeFactors', 'numberTheory.isPrime', 'numberTheory.divisors', 'numberTheory.eulerTotient', 'numberTheory.mobius', 'numberTheory.isComposite', 'numberTheory.countDistinctPrimeFactors'],
  },
  'countPrimeFactors': {
    category: 'numberTheory',
    description: 'Returns the number of prime factors of a number.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to count prime factors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { countPrimeFactors } = import("numberTheory");\ncountPrimeFactors(12)',
      'let { countPrimeFactors } = import("numberTheory");\ncountPrimeFactors(100)',
      'let { countPrimeFactors } = import("numberTheory");\ncountPrimeFactors(37)',
    ],
    seeAlso: ['numberTheory.primeFactors', 'numberTheory.distinctPrimeFactors', 'numberTheory.countDistinctPrimeFactors'],
  },
  'distinctPrimeFactors': {
    category: 'numberTheory',
    description: 'Returns the distinct prime factors of a number.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to find distinct prime factors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { distinctPrimeFactors } = import("numberTheory");\ndistinctPrimeFactors(12)',
      'let { distinctPrimeFactors } = import("numberTheory");\ndistinctPrimeFactors(100)',
      'let { distinctPrimeFactors } = import("numberTheory");\ndistinctPrimeFactors(37)',
    ],
    seeAlso: ['numberTheory.primeFactors', 'numberTheory.countDistinctPrimeFactors', 'numberTheory.countPrimeFactors'],
  },
  'countDistinctPrimeFactors': {
    category: 'numberTheory',
    description: 'Returns the number of distinct prime factors of a number.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to count distinct prime factors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { countDistinctPrimeFactors } = import("numberTheory");\ncountDistinctPrimeFactors(12)',
      'let { countDistinctPrimeFactors } = import("numberTheory");\ncountDistinctPrimeFactors(100)',
      'let { countDistinctPrimeFactors } = import("numberTheory");\ncountDistinctPrimeFactors(37)',
    ],
    seeAlso: ['numberTheory.distinctPrimeFactors', 'numberTheory.primeFactors', 'numberTheory.countPrimeFactors'],
  },
  'isCoprime': {
    category: 'numberTheory',
    description: 'Checks if two numbers are coprime (i.e., their GCD is 1).',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isCoprime } = import("numberTheory");\nisCoprime(12, 8)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(12, 5)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(37, 1)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(0, 0)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(0, 5)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(5, 0)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(1, 0)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(0, 1)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(1, 1)',
      'let { isCoprime } = import("numberTheory");\nisCoprime(2, 3)',
    ],
    seeAlso: ['numberTheory.gcd', 'numberTheory.eulerTotient', 'numberTheory.isDivisibleBy', 'numberTheory.lcm', 'numberTheory.carmichaelLambda'],
  },
  'isDivisibleBy': {
    category: 'numberTheory',
    description: 'Checks if a number is divisible by another number.',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isDivisibleBy } = import("numberTheory");\nisDivisibleBy(12, 4)',
      'let { isDivisibleBy } = import("numberTheory");\nisDivisibleBy(12, 5)',
      'let { isDivisibleBy } = import("numberTheory");\nisDivisibleBy(37, 1)',
      'let { isDivisibleBy } = import("numberTheory");\nisDivisibleBy(0, 0)',
      'let { isDivisibleBy } = import("numberTheory");\nisDivisibleBy(0, 5)',
      'let { isDivisibleBy } = import("numberTheory");\nisDivisibleBy(5, 0)',
    ],
    seeAlso: ['numberTheory.divisors', 'numberTheory.gcd', 'numberTheory.isCoprime'],
  },
  'gcd': {
    category: 'numberTheory',
    description: 'Calculates the greatest common divisor (GCD) of two numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { gcd } = import("numberTheory");\ngcd(100, 25)',
      'let { gcd } = import("numberTheory");\ngcd(37, 1)',
      'let { gcd } = import("numberTheory");\ngcd(0, 0)',
      'let { gcd } = import("numberTheory");\ngcd(0, 5)',
      'let { gcd } = import("numberTheory");\ngcd(5, 0)',
    ],
    seeAlso: ['numberTheory.lcm', 'numberTheory.extendedGcd', 'numberTheory.isCoprime', 'numberTheory.isDivisibleBy'],
  },
  'lcm': {
    category: 'numberTheory',
    description: 'Calculates the least common multiple (LCM) of two numbers.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { lcm } = import("numberTheory");\nlcm(100, 25)',
      'let { lcm } = import("numberTheory");\nlcm(37, 1)',
      'let { lcm } = import("numberTheory");\nlcm(0, 5)',
      'let { lcm } = import("numberTheory");\nlcm(5, 0)',
    ],
    seeAlso: ['numberTheory.gcd', 'numberTheory.divisors', 'numberTheory.isCoprime'],
  },
  'multinomial': {
    category: 'numberTheory',
    description: 'Calculates the multinomial coefficient from of a list of numbers representing the sizes of each group.',
    returns: {
      type: 'integer',
    },
    args: {
      args: {
        type: 'integer',
        rest: true,
        description: 'The numbers representing the sizes of each group.',
      },
    },
    variants: [
      {
        argumentNames: [
          'args',
        ],
      },
    ],
    examples: [
      'let { multinomial } = import("numberTheory");\nmultinomial(5, 2, 3)',
      'let { multinomial } = import("numberTheory");\nmultinomial(10, 2, 3, 5)',
    ],
    seeAlso: ['numberTheory.countCombinations', 'numberTheory.factorial', 'numberTheory.countPermutations'],
    hideOperatorForm: true,
  },
  'isAmicable': {
    category: 'numberTheory',
    description: 'Checks if two numbers are amicable (i.e., the sum of the proper divisors of each number equals the other number).',
    returns: {
      type: 'boolean',
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { isAmicable } = import("numberTheory");\nisAmicable(220, 284)',
      'let { isAmicable } = import("numberTheory");\nisAmicable(1184, 1210)',
      'let { isAmicable } = import("numberTheory");\nisAmicable(2620, 2924)',
      'let { isAmicable } = import("numberTheory");\nisAmicable(5020, 5564)',
      'let { isAmicable } = import("numberTheory");\nisAmicable(6232, 6368)',
    ],
    seeAlso: ['numberTheory.properDivisors', 'numberTheory.isPerfect', 'numberTheory.sigma', 'numberTheory.perfectSeq'],
  },
  'eulerTotient': {
    category: 'numberTheory',
    description: 'Calculates the Euler\'s totient function (φ(n)) of a number, which counts the integers up to n that are coprime to n.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to calculate the totient for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { eulerTotient } = import("numberTheory");\neulerTotient(1)',
      'let { eulerTotient } = import("numberTheory");\neulerTotient(2)',
      'let { eulerTotient } = import("numberTheory");\neulerTotient(10)',
      'let { eulerTotient } = import("numberTheory");\neulerTotient(20)',
    ],
    seeAlso: ['numberTheory.isCoprime', 'numberTheory.carmichaelLambda', 'numberTheory.mobius', 'numberTheory.primeFactors', 'numberTheory.mertens'],
  },
  'mobius': {
    category: 'numberTheory',
    description: 'Calculates the Möbius function (μ(n)) of a number, which is used in number theory.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to calculate the Möbius function for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { mobius } = import("numberTheory");\nmobius(1)',
      'let { mobius } = import("numberTheory");\nmobius(2)',
      'let { mobius } = import("numberTheory");\nmobius(3)',
      'let { mobius } = import("numberTheory");\nmobius(4)',
      'let { mobius } = import("numberTheory");\nmobius(6)',
      'let { mobius } = import("numberTheory");\nmobius(12)',
      'let { mobius } = import("numberTheory");\nmobius(30)',
    ],
    seeAlso: ['numberTheory.mertens', 'numberTheory.eulerTotient', 'numberTheory.primeFactors'],
  },
  'mertens': {
    category: 'numberTheory',
    description: 'Calculates the Mertens function (M(n)) of a number, which is the sum of the Möbius function up to n.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to calculate the Mertens function for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { mobius } = import("numberTheory");\nmobius(1)',
      'let { mobius } = import("numberTheory");\nmobius(2)',
      'let { mobius } = import("numberTheory");\nmobius(3)',
      'let { mobius } = import("numberTheory");\nmobius(4)',
      'let { mobius } = import("numberTheory");\nmobius(6)',
      'let { mobius } = import("numberTheory");\nmobius(12)',
      'let { mobius } = import("numberTheory");\nmobius(30)',
    ],
    seeAlso: ['numberTheory.mobius', 'numberTheory.eulerTotient'],
  },
  'sigma': {
    category: 'numberTheory',
    description: 'Calculates the sum of divisors function (σ(n)) of a number, which is the sum of all positive divisors of n.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to calculate the sum of divisors for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { sigma } = import("numberTheory");\nsigma(1)',
      'let { sigma } = import("numberTheory");\nsigma(2)',
      'let { sigma } = import("numberTheory");\nsigma(3)',
      'let { sigma } = import("numberTheory");\nsigma(4)',
      'let { sigma } = import("numberTheory");\nsigma(6)',
      'let { sigma } = import("numberTheory");\nsigma(12)',
      'let { sigma } = import("numberTheory");\nsigma(30)',
    ],
    seeAlso: ['numberTheory.divisors', 'numberTheory.isPerfect', 'numberTheory.isAbundant', 'numberTheory.isDeficient', 'numberTheory.isAmicable', 'numberTheory.countDivisors'],
  },
  'carmichaelLambda': {
    category: 'numberTheory',
    description: 'Calculates the Carmichael function (λ(n)) of a number, which is the smallest positive integer m such that a^m ≡ 1 (mod n) for all integers a coprime to n.',
    returns: {
      type: 'integer',
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to calculate the Carmichael function for.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { carmichaelLambda } = import("numberTheory");\ncarmichaelLambda(1)',
      'let { carmichaelLambda } = import("numberTheory");\ncarmichaelLambda(2)',
      'let { carmichaelLambda } = import("numberTheory");\ncarmichaelLambda(3)',
      'let { carmichaelLambda } = import("numberTheory");\ncarmichaelLambda(4)',
      'let { carmichaelLambda } = import("numberTheory");\ncarmichaelLambda(6)',
      'let { carmichaelLambda } = import("numberTheory");\ncarmichaelLambda(12)',
      'let { carmichaelLambda } = import("numberTheory");\ncarmichaelLambda(30)',
    ],
    seeAlso: ['numberTheory.eulerTotient', 'numberTheory.modExp', 'numberTheory.isCoprime'],
  },
  'cartesianProduct': {
    category: 'numberTheory',
    description: 'Calculates the Cartesian product of two or more sets.',
    returns: {
      type: 'array',
      array: true,
    },
    args: {
      sets: {
        type: 'array',
        array: true,
        description: 'The input collections to calculate the Cartesian product from.',
      },
      a: {
        type: 'array',
      },
      b: {
        type: 'array',
      },
    },
    variants: [
      {
        argumentNames: [
          'sets',
        ],
      },
    ],
    examples: [
      'let { cartesianProduct } = import("numberTheory");\ncartesianProduct([1, 2], ["a", "b"])',
      'let { cartesianProduct } = import("numberTheory");\ncartesianProduct([1, 2], ["a", "b"], [true, false])',
      'let { cartesianProduct } = import("numberTheory");\ncartesianProduct([1, 2, 3], ["x", "y", "z"])',
    ],
    seeAlso: ['numberTheory.combinations', 'numberTheory.powerSet', 'numberTheory.permutations'],
  },
  'perfectPower': {
    category: 'numberTheory',
    description: 'Returns a tuple of the base and exponent if the number is a perfect power, otherwise returns null.',
    returns: {
      type: ['array', 'null'],
    },
    args: {
      n: {
        type: 'integer',
        description: 'The number to check.',
      },
    },
    variants: [
      {
        argumentNames: [
          'n',
        ],
      },
    ],
    examples: [
      'let { perfectPower } = import("numberTheory");\nperfectPower(1)',
      'let { perfectPower } = import("numberTheory");\nperfectPower(2)',
      'let { perfectPower } = import("numberTheory");\nperfectPower(4)',
      'let { perfectPower } = import("numberTheory");\nperfectPower(8)',
      'let { perfectPower } = import("numberTheory");\nperfectPower(9)',
      'let { perfectPower } = import("numberTheory");\nperfectPower(16)',
      'let { perfectPower } = import("numberTheory");\nperfectPower(19)',
    ],
    seeAlso: ['numberTheory.isPerfectPower', 'numberTheory.perfectPowerSeq', 'numberTheory.isPerfectSquare', 'numberTheory.isPerfectCube'],
  },
  'modExp': {
    category: 'numberTheory',
    description: 'Calculates the modular exponentiation of a base raised to an exponent modulo a modulus.',
    returns: {
      type: 'integer',
    },
    args: {
      base: {
        type: 'integer',
      },
      exponent: {
        type: 'integer',
      },
      modulus: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'base',
          'exponent',
          'modulus',
        ],
      },
    ],
    examples: [
      'let { modExp } = import("numberTheory");\nmodExp(2, 3, 5)',
      'let { modExp } = import("numberTheory");\nmodExp(3, 4, 7)',
      'let { modExp } = import("numberTheory");\nmodExp(5, 6, 11)',
      'let { modExp } = import("numberTheory");\nmodExp(7, 8, 13)',
    ],
    seeAlso: ['numberTheory.modInv', 'numberTheory.carmichaelLambda', 'numberTheory.chineseRemainder'],
  },
  'modInv': {
    category: 'numberTheory',
    description: 'Calculates the modular multiplicative inverse of a number modulo another number.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'integer',
      },
      m: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'm',
        ],
      },
    ],
    examples: [
      'let { modInv } = import("numberTheory");\nmodInv(3, 11)',
      'let { modInv } = import("numberTheory");\nmodInv(10, 17)',
      'let { modInv } = import("numberTheory");\nmodInv(5, 13)',
      'let { modInv } = import("numberTheory");\nmodInv(7, 19)',
    ],
    seeAlso: ['numberTheory.modExp', 'numberTheory.extendedGcd', 'numberTheory.chineseRemainder'],
  },
  'extendedGcd': {
    category: 'numberTheory',
    description: 'Calculates the extended greatest common divisor (GCD) of two numbers, returning the GCD and the coefficients of Bézout\'s identity.',
    returns: {
      type: 'integer',
      array: true,
    },
    args: {
      a: {
        type: 'integer',
      },
      b: {
        type: 'integer',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { extendedGcd } = import("numberTheory");\nextendedGcd(30, 12)',
      'let { extendedGcd } = import("numberTheory");\nextendedGcd(56, 98)',
      'let { extendedGcd } = import("numberTheory");\nextendedGcd(101, 10)',
      'let { extendedGcd } = import("numberTheory");\nextendedGcd(17, 13)',
    ],
    seeAlso: ['numberTheory.gcd', 'numberTheory.modInv', 'numberTheory.chineseRemainder'],
  },
  'chineseRemainder': {
    category: 'numberTheory',
    description: 'Solves a system of simultaneous congruences using the Chinese Remainder Theorem.',
    returns: {
      type: 'integer',
    },
    args: {
      remainders: {
        type: 'integer',
        array: true,
        description: 'The remainders of the congruences.',
      },
      moduli: {
        type: 'integer',
        array: true,
        description: 'The moduli of the congruences.',
      },
      a: {
        type: 'array',
      },
      b: {
        type: 'array',
      },
    },
    variants: [
      {
        argumentNames: [
          'remainders',
          'moduli',
        ],
      },
    ],
    examples: [
      'let { chineseRemainder } = import("numberTheory");\nchineseRemainder([2, 3], [3, 5])',
      'let { chineseRemainder } = import("numberTheory");\nchineseRemainder([1, 2], [3, 4])',
      'let { chineseRemainder } = import("numberTheory");\nchineseRemainder([0, 1], [2, 3])',
      'let { chineseRemainder } = import("numberTheory");\nchineseRemainder([1, 2, 3], [4, 5, 7])',
    ],
    seeAlso: ['numberTheory.modExp', 'numberTheory.modInv', 'numberTheory.extendedGcd'],
  },
  'stirlingFirst': {
    category: 'numberTheory',
    description: 'Calculates the Stirling numbers of the first kind, which count the number of permutations of n elements with k cycles.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'integer',
        description: 'The number of elements.',
      },
      b: {
        type: 'integer',
        description: 'The number of cycles.',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { stirlingFirst } = import("numberTheory");\nstirlingFirst(5, 2)',
      'let { stirlingFirst } = import("numberTheory");\nstirlingFirst(4, 3)',
      'let { stirlingFirst } = import("numberTheory");\nstirlingFirst(6, 1)',
      'let { stirlingFirst } = import("numberTheory");\nstirlingFirst(7, 4)',
      'let { stirlingFirst } = import("numberTheory");\nstirlingFirst(8, 5)',
    ],
    seeAlso: ['numberTheory.stirlingSecond', 'numberTheory.bellSeq', 'numberTheory.countPermutations'],
  },
  'stirlingSecond': {
    category: 'numberTheory',
    description: 'Calculates the Stirling numbers of the second kind, which count the number of ways to partition n elements into k non-empty subsets.',
    returns: {
      type: 'integer',
    },
    args: {
      a: {
        type: 'integer',
        description: 'The number of elements.',
      },
      b: {
        type: 'integer',
        description: 'The number of subsets.',
      },
    },
    variants: [
      {
        argumentNames: [
          'a',
          'b',
        ],
      },
    ],
    examples: [
      'let { stirlingSecond } = import("numberTheory");\nstirlingSecond(5, 2)',
      'let { stirlingSecond } = import("numberTheory");\nstirlingSecond(4, 3)',
      'let { stirlingSecond } = import("numberTheory");\nstirlingSecond(6, 1)',
      'let { stirlingSecond } = import("numberTheory");\nstirlingSecond(7, 4)',
      'let { stirlingSecond } = import("numberTheory");\nstirlingSecond(8, 5)',
    ],
    seeAlso: ['numberTheory.stirlingFirst', 'numberTheory.bellSeq', 'numberTheory.countCombinations'],
  },
}
