import type { FunctionDocs } from '../../interface'

export const moduleDocs: Record<string, FunctionDocs> = {
  'abundantSeq': {
    category: 'number-theory',
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
      'let { abundantSeq } = import(number-theory);\nabundantSeq(1)',
      'let { abundantSeq } = import(number-theory);\nabundantSeq(5)',
    ],
    seeAlso: ['number-theory.abundantNth', 'number-theory.abundantTakeWhile', 'number-theory.isAbundant', 'number-theory.deficientSeq', 'number-theory.perfectSeq'],
  },
  'abundantTakeWhile': {
    category: 'number-theory',
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
      'let { abundantTakeWhile } = import(number-theory);\nabundantTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['number-theory.abundantSeq', 'number-theory.abundantNth', 'number-theory.isAbundant'],
  },
  'abundantNth': {
    category: 'number-theory',
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
      'let { abundantNth } = import(number-theory);\nabundantNth(1)',
      'let { abundantNth } = import(number-theory);\nabundantNth(5)',
    ],
    seeAlso: ['number-theory.abundantSeq', 'number-theory.abundantTakeWhile', 'number-theory.isAbundant'],
  },
  'isAbundant': {
    category: 'number-theory',
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
      'let { isAbundant } = import(number-theory);\nisAbundant(12)',
      'let { isAbundant } = import(number-theory);\nisAbundant(15)',
    ],
    seeAlso: ['number-theory.abundantSeq', 'number-theory.abundantNth', 'number-theory.isDeficient', 'number-theory.isPerfect', 'number-theory.sigma', 'number-theory.divisors', 'number-theory.abundantTakeWhile'],
  },
  'arithmeticSeq': {
    category: 'number-theory',
    description: 'Generates the arithmetic sequence for a given $start, $step, and $length.',
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
      'let { arithmeticSeq } = import(number-theory);\narithmeticSeq(3, 2, 2)',
      'let { arithmeticSeq } = import(number-theory);\narithmeticSeq(2, 3, 2)',
      'let { arithmeticSeq } = import(number-theory);\narithmeticSeq(1, 2, 2)',
      'let { arithmeticSeq } = import(number-theory);\narithmeticSeq(1, 1.5, 12)',
    ],
    seeAlso: ['number-theory.arithmeticNth', 'number-theory.arithmeticTakeWhile', 'number-theory.isArithmetic', 'number-theory.geometricSeq'],
  },
  'arithmeticTakeWhile': {
    category: 'number-theory',
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
      'let { arithmeticTakeWhile } = import(number-theory);\narithmeticTakeWhile(1, 0.25, -> $ < 3)',
    ],
    seeAlso: ['number-theory.arithmeticSeq', 'number-theory.arithmeticNth', 'number-theory.isArithmetic'],
  },
  'arithmeticNth': {
    category: 'number-theory',
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
      'let { arithmeticNth } = import(number-theory);\narithmeticNth(3, 2, 2)',
      'let { arithmeticNth } = import(number-theory);\narithmeticNth(2, 3, 2)',
      'let { arithmeticNth } = import(number-theory);\narithmeticNth(1, 2, 2)',
      'let { arithmeticNth } = import(number-theory);\narithmeticNth(1, 1.5, 12)',
    ],
    seeAlso: ['number-theory.arithmeticSeq', 'number-theory.arithmeticTakeWhile', 'number-theory.isArithmetic'],
  },
  'isArithmetic': {
    category: 'number-theory',
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
      'let { isArithmetic } = import(number-theory);\nisArithmetic(3, 2, 2)',
      'let { isArithmetic } = import(number-theory);\nisArithmetic(2, 3, 2)',
      'let { isArithmetic } = import(number-theory);\nisArithmetic(1, 2, 2)',
      'let { isArithmetic } = import(number-theory);\nisArithmetic(1, 1.5, 12)',
    ],
    seeAlso: ['number-theory.arithmeticSeq', 'number-theory.arithmeticNth', 'number-theory.isGeometric', 'number-theory.arithmeticTakeWhile'],
  },
  'bellSeq': {
    category: 'number-theory',
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
      'let { bellSeq } = import(number-theory);\nbellSeq(5)',
      'let { bellSeq } = import(number-theory);\nbellSeq(10)',
      'let { bellSeq } = import(number-theory);\nbellSeq()',
    ],
    seeAlso: ['number-theory.bellNth', 'number-theory.bellTakeWhile', 'number-theory.isBell', 'number-theory.catalanSeq', 'number-theory.stirlingSecond', 'number-theory.stirlingFirst'],
  },
  'bellTakeWhile': {
    category: 'number-theory',
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
      'let { bellTakeWhile } = import(number-theory);\nbellTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.bellSeq', 'number-theory.bellNth', 'number-theory.isBell'],
  },
  'bellNth': {
    category: 'number-theory',
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
      'let { bellNth } = import(number-theory);\nbellNth(5)',
      'let { bellNth } = import(number-theory);\nbellNth(10)',
    ],
    seeAlso: ['number-theory.bellSeq', 'number-theory.bellTakeWhile', 'number-theory.isBell'],
  },
  'isBell': {
    category: 'number-theory',
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
      'let { isBell } = import(number-theory);\nisBell(1)',
      'let { isBell } = import(number-theory);\nisBell(27644437)',
      'let { isBell } = import(number-theory);\nisBell(27644436)',
    ],
    seeAlso: ['number-theory.bellSeq', 'number-theory.bellNth', 'number-theory.isCatalan', 'number-theory.bellTakeWhile'],
  },
  'bernoulliSeq': {
    category: 'number-theory',
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
      'let { bernoulliSeq } = import(number-theory);\nbernoulliSeq(5)',
      'let { bernoulliSeq } = import(number-theory);\nbernoulliSeq(10)',
    ],
    seeAlso: ['number-theory.bernoulliNth', 'number-theory.bernoulliTakeWhile'],
  },
  'bernoulliTakeWhile': {
    category: 'number-theory',
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
      'let { bernoulliTakeWhile } = import(number-theory);\nbernoulliTakeWhile(-> abs($) < 100)',
    ],
    seeAlso: ['number-theory.bernoulliSeq', 'number-theory.bernoulliNth'],
  },
  'bernoulliNth': {
    category: 'number-theory',
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
      'let { bernoulliNth } = import(number-theory);\nbernoulliNth(5)',
      'let { bernoulliNth } = import(number-theory);\nbernoulliNth(10)',
      'let { bernoulliNth } = import(number-theory);\nbernoulliNth(23)',
    ],
    seeAlso: ['number-theory.bernoulliSeq', 'number-theory.bernoulliTakeWhile'],
  },
  'catalanSeq': {
    category: 'number-theory',
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
      'let { catalanSeq } = import(number-theory);\ncatalanSeq(5)',
      'let { catalanSeq } = import(number-theory);\ncatalanSeq(10)',
      'let { catalanSeq } = import(number-theory);\ncatalanSeq()',
    ],
    seeAlso: ['number-theory.catalanNth', 'number-theory.catalanTakeWhile', 'number-theory.isCatalan', 'number-theory.bellSeq'],
  },
  'catalanTakeWhile': {
    category: 'number-theory',
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
      'let { catalanTakeWhile } = import(number-theory);\ncatalanTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.catalanSeq', 'number-theory.catalanNth', 'number-theory.isCatalan'],
  },
  'catalanNth': {
    category: 'number-theory',
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
      'let { catalanNth } = import(number-theory);\ncatalanNth(5)',
      'let { catalanNth } = import(number-theory);\ncatalanNth(10)',
    ],
    seeAlso: ['number-theory.catalanSeq', 'number-theory.catalanTakeWhile', 'number-theory.isCatalan'],
  },
  'isCatalan': {
    category: 'number-theory',
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
      'let { isCatalan } = import(number-theory);\nisCatalan(5)',
      'let { isCatalan } = import(number-theory);\nisCatalan(10)',
    ],
    seeAlso: ['number-theory.catalanSeq', 'number-theory.catalanNth', 'number-theory.isBell', 'number-theory.catalanTakeWhile'],
  },
  'collatzSeq': {
    category: 'number-theory',
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
      'let { collatzSeq } = import(number-theory);\ncollatzSeq(3)',
      'let { collatzSeq } = import(number-theory);\ncollatzSeq(11)',
    ],
    seeAlso: ['number-theory.jugglerSeq'],
  },
  'compositeSeq': {
    category: 'number-theory',
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
      'let { compositeSeq } = import(number-theory);\ncompositeSeq(1)',
      'let { compositeSeq } = import(number-theory);\ncompositeSeq(2)',
      'let { compositeSeq } = import(number-theory);\ncompositeSeq(10)',
    ],
    seeAlso: ['number-theory.compositeNth', 'number-theory.compositeTakeWhile', 'number-theory.isComposite', 'number-theory.primeSeq'],
  },
  'compositeTakeWhile': {
    category: 'number-theory',
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
      'let { compositeTakeWhile } = import(number-theory);\ncompositeTakeWhile(-> $ < 50)',
    ],
    seeAlso: ['number-theory.compositeSeq', 'number-theory.compositeNth', 'number-theory.isComposite'],
  },
  'compositeNth': {
    category: 'number-theory',
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
      'let { compositeNth } = import(number-theory);\ncompositeNth(1)',
      'let { compositeNth } = import(number-theory);\ncompositeNth(2)',
      'let { compositeNth } = import(number-theory);\ncompositeNth(10)',
    ],
    seeAlso: ['number-theory.compositeSeq', 'number-theory.compositeTakeWhile', 'number-theory.isComposite'],
  },
  'isComposite': {
    category: 'number-theory',
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
      'let { isComposite } = import(number-theory);\nisComposite(4)',
      'let { isComposite } = import(number-theory);\nisComposite(5)',
      'let { isComposite } = import(number-theory);\nisComposite(11)',
    ],
    seeAlso: ['number-theory.compositeSeq', 'number-theory.compositeNth', 'number-theory.isPrime', 'number-theory.primeFactors', 'number-theory.compositeTakeWhile'],
  },
  'deficientSeq': {
    category: 'number-theory',
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
      'let { deficientSeq } = import(number-theory);\ndeficientSeq(1)',
      'let { deficientSeq } = import(number-theory);\ndeficientSeq(5)',
    ],
    seeAlso: ['number-theory.deficientNth', 'number-theory.deficientTakeWhile', 'number-theory.isDeficient', 'number-theory.abundantSeq', 'number-theory.perfectSeq'],
  },
  'deficientTakeWhile': {
    category: 'number-theory',
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
      'let { deficientTakeWhile } = import(number-theory);\ndeficientTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['number-theory.deficientSeq', 'number-theory.deficientNth', 'number-theory.isDeficient'],
  },
  'deficientNth': {
    category: 'number-theory',
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
      'let { deficientNth } = import(number-theory);\ndeficientNth(5)',
      'let { deficientNth } = import(number-theory);\ndeficientNth(12)',
    ],
    seeAlso: ['number-theory.deficientSeq', 'number-theory.deficientTakeWhile', 'number-theory.isDeficient'],
  },
  'isDeficient': {
    category: 'number-theory',
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
      'let { isDeficient } = import(number-theory);\nisDeficient(12)',
      'let { isDeficient } = import(number-theory);\nisDeficient(15)',
    ],
    seeAlso: ['number-theory.deficientSeq', 'number-theory.deficientNth', 'number-theory.isAbundant', 'number-theory.isPerfect', 'number-theory.sigma', 'number-theory.divisors', 'number-theory.deficientTakeWhile'],
  },
  'factorialSeq': {
    category: 'number-theory',
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
      'let { factorialSeq } = import(number-theory);\nfactorialSeq(1)',
      'let { factorialSeq } = import(number-theory);\nfactorialSeq(2)',
      'let { factorialSeq } = import(number-theory);\nfactorialSeq(3)',
      'let { factorialSeq } = import(number-theory);\nfactorialSeq(4)',
      'let { factorialSeq } = import(number-theory);\nfactorialSeq(5)',
      'let { factorialSeq } = import(number-theory);\nfactorialSeq(10)',
    ],
    seeAlso: ['number-theory.factorialNth', 'number-theory.factorialTakeWhile', 'number-theory.isFactorial', 'number-theory.factorial'],
  },
  'factorialTakeWhile': {
    category: 'number-theory',
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
      'let { factorialTakeWhile } = import(number-theory);\nfactorialTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.factorialSeq', 'number-theory.factorialNth', 'number-theory.isFactorial'],
  },
  'factorialNth': {
    category: 'number-theory',
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
      'let { factorialNth } = import(number-theory);\nfactorialNth(1)',
      'let { factorialNth } = import(number-theory);\nfactorialNth(2)',
      'let { factorialNth } = import(number-theory);\nfactorialNth(3)',
      'let { factorialNth } = import(number-theory);\nfactorialNth(4)',
      'let { factorialNth } = import(number-theory);\nfactorialNth(5)',
      'let { factorialNth } = import(number-theory);\nfactorialNth(10)',
    ],
    seeAlso: ['number-theory.factorialSeq', 'number-theory.factorialTakeWhile', 'number-theory.isFactorial', 'number-theory.factorial'],
  },
  'isFactorial': {
    category: 'number-theory',
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
      'let { isFactorial } = import(number-theory);\nisFactorial(1)',
      'let { isFactorial } = import(number-theory);\nisFactorial(2)',
      'let { isFactorial } = import(number-theory);\nisFactorial(3)',
      'let { isFactorial } = import(number-theory);\nisFactorial(4)',
      'let { isFactorial } = import(number-theory);\nisFactorial(5)',
      'let { isFactorial } = import(number-theory);\nisFactorial(6)',
      'let { isFactorial } = import(number-theory);\nisFactorial(7)',
      'let { isFactorial } = import(number-theory);\nisFactorial(8)',
      'let { isFactorial } = import(number-theory);\nisFactorial(9)',
      'let { isFactorial } = import(number-theory);\nisFactorial(3628800)',
    ],
    seeAlso: ['number-theory.factorialSeq', 'number-theory.factorialNth', 'number-theory.factorial', 'number-theory.factorialTakeWhile'],
  },
  'fibonacciSeq': {
    category: 'number-theory',
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
      'let { fibonacciSeq } = import(number-theory);\nfibonacciSeq(1)',
      'let { fibonacciSeq } = import(number-theory);\nfibonacciSeq(2)',
      'let { fibonacciSeq } = import(number-theory);\nfibonacciSeq()',
    ],
    seeAlso: ['number-theory.fibonacciNth', 'number-theory.fibonacciTakeWhile', 'number-theory.isFibonacci', 'number-theory.lucasSeq', 'number-theory.tribonacciSeq', 'number-theory.pellSeq', 'number-theory.padovanSeq'],
  },
  'fibonacciTakeWhile': {
    category: 'number-theory',
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
      'let { fibonacciTakeWhile } = import(number-theory);\nfibonacciTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['number-theory.fibonacciSeq', 'number-theory.fibonacciNth', 'number-theory.isFibonacci'],
  },
  'fibonacciNth': {
    category: 'number-theory',
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
      'let { fibonacciNth } = import(number-theory);\nfibonacciNth(5)',
      'let { fibonacciNth } = import(number-theory);\nfibonacciNth(50)',
    ],
    seeAlso: ['number-theory.fibonacciSeq', 'number-theory.fibonacciTakeWhile', 'number-theory.isFibonacci'],
  },
  'isFibonacci': {
    category: 'number-theory',
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
      'let { isFibonacci } = import(number-theory);\nisFibonacci(0)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(1)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(2)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(3)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(4)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(5)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(6)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(7)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(8)',
      'let { isFibonacci } = import(number-theory);\nisFibonacci(9)',
    ],
    seeAlso: ['number-theory.fibonacciSeq', 'number-theory.fibonacciNth', 'number-theory.isLucas', 'number-theory.fibonacciTakeWhile', 'number-theory.isTribonacci', 'number-theory.isPadovan', 'number-theory.isPell'],
  },
  'geometricSeq': {
    category: 'number-theory',
    description: 'Generates the geometric sequence for a given $start, $ratio, and $length.',
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
      'let { geometricSeq } = import(number-theory);\ngeometricSeq(3, 2, 2)',
      'let { geometricSeq } = import(number-theory);\ngeometricSeq(2, 3, 2)',
      'let { geometricSeq } = import(number-theory);\ngeometricSeq(1, 2, 2)',
      'let { geometricSeq } = import(number-theory);\ngeometricSeq(1, 1.5, 12)',
    ],
    seeAlso: ['number-theory.geometricNth', 'number-theory.geometricTakeWhile', 'number-theory.isGeometric', 'number-theory.arithmeticSeq'],
  },
  'geometricTakeWhile': {
    category: 'number-theory',
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
      'let { geometricTakeWhile } = import(number-theory);\ngeometricTakeWhile(1, 1.5, -> $ < 10)',
    ],
    seeAlso: ['number-theory.geometricSeq', 'number-theory.geometricNth', 'number-theory.isGeometric'],
  },
  'geometricNth': {
    category: 'number-theory',
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
      'let { geometricNth } = import(number-theory);\ngeometricNth(3, 2, 2)',
      'let { geometricNth } = import(number-theory);\ngeometricNth(2, 3, 2)',
      'let { geometricNth } = import(number-theory);\ngeometricNth(1, 2, 2)',
      'let { geometricNth } = import(number-theory);\ngeometricNth(1, 1.5, 4)',
    ],
    seeAlso: ['number-theory.geometricSeq', 'number-theory.geometricTakeWhile', 'number-theory.isGeometric'],
  },
  'isGeometric': {
    category: 'number-theory',
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
      'let { isGeometric } = import(number-theory);\nisGeometric(1, 2, 1)',
      'let { isGeometric } = import(number-theory);\nisGeometric(2, 3, 2)',
      'let { isGeometric } = import(number-theory);\nisGeometric(3, 2, 2)',
      'let { isGeometric } = import(number-theory);\nisGeometric(1, 1.5, 2.25)',
      'let { isGeometric } = import(number-theory);\nisGeometric(1, 1.5, -4)',
    ],
    seeAlso: ['number-theory.geometricSeq', 'number-theory.geometricNth', 'number-theory.isArithmetic', 'number-theory.geometricTakeWhile'],
  },
  'golombSeq': {
    category: 'number-theory',
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
      'let { golombSeq } = import(number-theory);\ngolombSeq(5)',
      'let { golombSeq } = import(number-theory);\ngolombSeq(20)',
    ],
    seeAlso: ['number-theory.golombNth', 'number-theory.golombTakeWhile', 'number-theory.isGolomb', 'number-theory.recamanSeq'],
  },
  'golombTakeWhile': {
    category: 'number-theory',
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
      'let { golombTakeWhile } = import(number-theory);\ngolombTakeWhile(-> $ <= 10)',
    ],
    seeAlso: ['number-theory.golombSeq', 'number-theory.golombNth', 'number-theory.isGolomb'],
  },
  'golombNth': {
    category: 'number-theory',
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
      'let { golombNth } = import(number-theory);\ngolombNth(5)',
      'let { golombNth } = import(number-theory);\ngolombNth(1000)',
    ],
    seeAlso: ['number-theory.golombSeq', 'number-theory.golombTakeWhile', 'number-theory.isGolomb'],
  },
  'isGolomb': {
    category: 'number-theory',
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
      'let { isGolomb } = import(number-theory);\nisGolomb(1)',
      'let { isGolomb } = import(number-theory);\nisGolomb(2)',
      'let { isGolomb } = import(number-theory);\nisGolomb(3345)',
      'let { isGolomb } = import(number-theory);\nisGolomb(67867864)',
    ],
    seeAlso: ['number-theory.golombSeq', 'number-theory.golombNth', 'number-theory.golombTakeWhile'],
  },
  'happySeq': {
    category: 'number-theory',
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
      'let { happySeq } = import(number-theory);\nhappySeq(1)',
      'let { happySeq } = import(number-theory);\nhappySeq(2)',
      'let { happySeq } = import(number-theory);\nhappySeq(20)',
    ],
    seeAlso: ['number-theory.happyNth', 'number-theory.happyTakeWhile', 'number-theory.isHappy', 'number-theory.luckySeq'],
  },
  'happyTakeWhile': {
    category: 'number-theory',
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
      'let { happyTakeWhile } = import(number-theory);\nhappyTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['number-theory.happySeq', 'number-theory.happyNth', 'number-theory.isHappy'],
  },
  'happyNth': {
    category: 'number-theory',
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
      'let { happyNth } = import(number-theory);\nhappyNth(1)',
      'let { happyNth } = import(number-theory);\nhappyNth(2)',
      'let { happyNth } = import(number-theory);\nhappyNth(20)',
    ],
    seeAlso: ['number-theory.happySeq', 'number-theory.happyTakeWhile', 'number-theory.isHappy'],
  },
  'isHappy': {
    category: 'number-theory',
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
      'let { isHappy } = import(number-theory);\nisHappy(1)',
      'let { isHappy } = import(number-theory);\nisHappy(2)',
      'let { isHappy } = import(number-theory);\nisHappy(100)',
    ],
    seeAlso: ['number-theory.happySeq', 'number-theory.happyNth', 'number-theory.happyTakeWhile'],
  },
  'jugglerSeq': {
    category: 'number-theory',
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
      'let { jugglerSeq } = import(number-theory);\njugglerSeq(3)',
      'let { jugglerSeq } = import(number-theory);\njugglerSeq(5)',
    ],
    seeAlso: ['number-theory.collatzSeq'],
  },
  'lookAndSaySeq': {
    category: 'number-theory',
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
      'let { lookAndSaySeq } = import(number-theory);\nlookAndSaySeq(5)',
    ],
    seeAlso: ['number-theory.lookAndSayNth', 'number-theory.lookAndSayTakeWhile', 'number-theory.isLookAndSay'],
  },
  'lookAndSayTakeWhile': {
    category: 'number-theory',
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
      'let { lookAndSayTakeWhile } = import(number-theory);\nlookAndSayTakeWhile((term, index) -> count(term) < 10)',
      'let { lookAndSayTakeWhile } = import(number-theory);\nlookAndSayTakeWhile(-> $2 <= 10)',
    ],
    seeAlso: ['number-theory.lookAndSaySeq', 'number-theory.lookAndSayNth', 'number-theory.isLookAndSay'],
  },
  'lookAndSayNth': {
    category: 'number-theory',
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
      'let { lookAndSayNth } = import(number-theory);\nlookAndSayNth(5)',
    ],
    seeAlso: ['number-theory.lookAndSaySeq', 'number-theory.lookAndSayTakeWhile', 'number-theory.isLookAndSay'],
  },
  'isLookAndSay': {
    category: 'number-theory',
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
      'let { isLookAndSay } = import(number-theory);\nisLookAndSay("111221")',
      'let { isLookAndSay } = import(number-theory);\nisLookAndSay("123")',
    ],
    seeAlso: ['number-theory.lookAndSaySeq', 'number-theory.lookAndSayNth', 'number-theory.lookAndSayTakeWhile'],
  },
  'lucasSeq': {
    category: 'number-theory',
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
      'let { lucasSeq } = import(number-theory);\nlucasSeq(1)',
      'let { lucasSeq } = import(number-theory);\nlucasSeq(2)',
      'let { lucasSeq } = import(number-theory);\nlucasSeq()',
    ],
    seeAlso: ['number-theory.lucasNth', 'number-theory.lucasTakeWhile', 'number-theory.isLucas', 'number-theory.fibonacciSeq'],
  },
  'lucasTakeWhile': {
    category: 'number-theory',
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
      'let { lucasTakeWhile } = import(number-theory);\nlucasTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['number-theory.lucasSeq', 'number-theory.lucasNth', 'number-theory.isLucas'],
  },
  'lucasNth': {
    category: 'number-theory',
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
      'let { lucasNth } = import(number-theory);\nlucasNth(1)',
      'let { lucasNth } = import(number-theory);\nlucasNth(2)',
      'let { lucasNth } = import(number-theory);\nlucasNth(10)',
    ],
    seeAlso: ['number-theory.lucasSeq', 'number-theory.lucasTakeWhile', 'number-theory.isLucas'],
  },
  'isLucas': {
    category: 'number-theory',
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
      'let { isLucas } = import(number-theory);\nisLucas(1)',
      'let { isLucas } = import(number-theory);\nisLucas(2)',
      'let { isLucas } = import(number-theory);\nisLucas(10)',
    ],
    seeAlso: ['number-theory.lucasSeq', 'number-theory.lucasNth', 'number-theory.isFibonacci', 'number-theory.lucasTakeWhile'],
  },
  'luckySeq': {
    category: 'number-theory',
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
      'let { luckySeq } = import(number-theory);\nluckySeq(1)',
      'let { luckySeq } = import(number-theory);\nluckySeq(2)',
      'let { luckySeq } = import(number-theory);\nluckySeq(20)',
    ],
    seeAlso: ['number-theory.luckyNth', 'number-theory.luckyTakeWhile', 'number-theory.isLucky', 'number-theory.happySeq', 'number-theory.primeSeq'],
  },
  'luckyTakeWhile': {
    category: 'number-theory',
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
      'let { luckyTakeWhile } = import(number-theory);\nluckyTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['number-theory.luckySeq', 'number-theory.luckyNth', 'number-theory.isLucky'],
  },
  'luckyNth': {
    category: 'number-theory',
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
      'let { luckyNth } = import(number-theory);\nluckyNth(1)',
      'let { luckyNth } = import(number-theory);\nluckyNth(2)',
      'let { luckyNth } = import(number-theory);\nluckyNth(20)',
    ],
    seeAlso: ['number-theory.luckySeq', 'number-theory.luckyTakeWhile', 'number-theory.isLucky'],
  },
  'isLucky': {
    category: 'number-theory',
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
      'let { isLucky } = import(number-theory);\nisLucky(4)',
      'let { isLucky } = import(number-theory);\nisLucky(7)',
      'let { isLucky } = import(number-theory);\nisLucky(33)',
    ],
    seeAlso: ['number-theory.luckySeq', 'number-theory.luckyNth', 'number-theory.isPrime', 'number-theory.luckyTakeWhile'],
  },
  'mersenneSeq': {
    category: 'number-theory',
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
      'let { mersenneSeq } = import(number-theory);\nmersenneSeq(1)',
      'let { mersenneSeq } = import(number-theory);\nmersenneSeq(5)',
      'let { mersenneSeq } = import(number-theory);\nmersenneSeq()',
    ],
    seeAlso: ['number-theory.mersenneNth', 'number-theory.mersenneTakeWhile', 'number-theory.isMersenne', 'number-theory.primeSeq'],
  },
  'mersenneTakeWhile': {
    category: 'number-theory',
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
      'let { mersenneTakeWhile } = import(number-theory);\nmersenneTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.mersenneSeq', 'number-theory.mersenneNth', 'number-theory.isMersenne'],
  },
  'mersenneNth': {
    category: 'number-theory',
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
      'let { mersenneNth } = import(number-theory);\nmersenneNth(1)',
      'let { mersenneNth } = import(number-theory);\nmersenneNth(5)',
    ],
    seeAlso: ['number-theory.mersenneSeq', 'number-theory.mersenneTakeWhile', 'number-theory.isMersenne'],
  },
  'isMersenne': {
    category: 'number-theory',
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
      'let { isMersenne } = import(number-theory);\nisMersenne(3)',
      'let { isMersenne } = import(number-theory);\nisMersenne(4)',
      'let { isMersenne } = import(number-theory);\nisMersenne(7)',
    ],
    seeAlso: ['number-theory.mersenneSeq', 'number-theory.mersenneNth', 'number-theory.isPrime', 'number-theory.mersenneTakeWhile'],
  },
  'padovanSeq': {
    category: 'number-theory',
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
      'let { padovanSeq } = import(number-theory);\npadovanSeq(5)',
      'let { padovanSeq } = import(number-theory);\npadovanSeq(10)',
      'let { padovanSeq } = import(number-theory);\npadovanSeq(20)',
    ],
    seeAlso: ['number-theory.padovanNth', 'number-theory.padovanTakeWhile', 'number-theory.isPadovan', 'number-theory.fibonacciSeq'],
  },
  'padovanTakeWhile': {
    category: 'number-theory',
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
      'let { padovanTakeWhile } = import(number-theory);\npadovanTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.padovanSeq', 'number-theory.padovanNth', 'number-theory.isPadovan'],
  },
  'padovanNth': {
    category: 'number-theory',
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
      'let { padovanNth } = import(number-theory);\npadovanNth(5)',
      'let { padovanNth } = import(number-theory);\npadovanNth(10)',
      'let { padovanNth } = import(number-theory);\npadovanNth(20)',
    ],
    seeAlso: ['number-theory.padovanSeq', 'number-theory.padovanTakeWhile', 'number-theory.isPadovan'],
  },
  'isPadovan': {
    category: 'number-theory',
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
      'let { isPadovan } = import(number-theory);\nisPadovan(1)',
      'let { isPadovan } = import(number-theory);\nisPadovan(265)',
      'let { isPadovan } = import(number-theory);\nisPadovan(6)',
    ],
    seeAlso: ['number-theory.padovanSeq', 'number-theory.padovanNth', 'number-theory.isFibonacci', 'number-theory.padovanTakeWhile'],
  },
  'partitionSeq': {
    category: 'number-theory',
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
      'let { partitionSeq } = import(number-theory);\npartitionSeq(1)',
      'let { partitionSeq } = import(number-theory);\npartitionSeq(10)',
      'let { partitionSeq } = import(number-theory);\npartitionSeq()',
    ],
    seeAlso: ['number-theory.partitionNth', 'number-theory.partitionTakeWhile', 'number-theory.isPartition', 'number-theory.partitions', 'number-theory.countPartitions'],
  },
  'partitionTakeWhile': {
    category: 'number-theory',
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
      'let { partitionTakeWhile } = import(number-theory);\npartitionTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.partitionSeq', 'number-theory.partitionNth', 'number-theory.isPartition'],
  },
  'partitionNth': {
    category: 'number-theory',
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
      'let { partitionNth } = import(number-theory);\npartitionNth(1)',
      'let { partitionNth } = import(number-theory);\npartitionNth(5)',
    ],
    seeAlso: ['number-theory.partitionSeq', 'number-theory.partitionTakeWhile', 'number-theory.isPartition'],
  },
  'isPartition': {
    category: 'number-theory',
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
      'let { isPartition } = import(number-theory);\nisPartition(0)',
      'let { isPartition } = import(number-theory);\nisPartition(1)',
      'let { isPartition } = import(number-theory);\nisPartition(2)',
      'let { isPartition } = import(number-theory);\nisPartition(3)',
      'let { isPartition } = import(number-theory);\nisPartition(4)',
      'let { isPartition } = import(number-theory);\nisPartition(5)',
    ],
    seeAlso: ['number-theory.partitionSeq', 'number-theory.partitionNth', 'number-theory.partitions', 'number-theory.partitionTakeWhile'],
  },
  'pellSeq': {
    category: 'number-theory',
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
      'let { pellSeq } = import(number-theory);\npellSeq(5)',
      'let { pellSeq } = import(number-theory);\npellSeq(10)',
      'let { pellSeq } = import(number-theory);\npellSeq()',
    ],
    seeAlso: ['number-theory.pellNth', 'number-theory.pellTakeWhile', 'number-theory.isPell', 'number-theory.fibonacciSeq'],
  },
  'pellTakeWhile': {
    category: 'number-theory',
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
      'let { pellTakeWhile } = import(number-theory);\npellTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.pellSeq', 'number-theory.pellNth', 'number-theory.isPell'],
  },
  'pellNth': {
    category: 'number-theory',
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
      'let { pellNth } = import(number-theory);\npellNth(5)',
      'let { pellNth } = import(number-theory);\npellNth(10)',
      'let { pellNth } = import(number-theory);\npellNth(20)',
    ],
    seeAlso: ['number-theory.pellSeq', 'number-theory.pellTakeWhile', 'number-theory.isPell'],
  },
  'isPell': {
    category: 'number-theory',
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
      'let { isPell } = import(number-theory);\nisPell(1)',
      'let { isPell } = import(number-theory);\nisPell(470832)',
      'let { isPell } = import(number-theory);\nisPell(10)',
    ],
    seeAlso: ['number-theory.pellSeq', 'number-theory.pellNth', 'number-theory.isFibonacci', 'number-theory.pellTakeWhile'],
  },
  'perfectSeq': {
    category: 'number-theory',
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
      'let { perfectSeq } = import(number-theory);\nperfectSeq(1)',
      'let { perfectSeq } = import(number-theory);\nperfectSeq(5)',
      'let { perfectSeq } = import(number-theory);\nperfectSeq()',
    ],
    seeAlso: ['number-theory.perfectNth', 'number-theory.perfectTakeWhile', 'number-theory.isPerfect', 'number-theory.abundantSeq', 'number-theory.deficientSeq', 'number-theory.isAmicable'],
  },
  'perfectTakeWhile': {
    category: 'number-theory',
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
      'let { perfectTakeWhile } = import(number-theory);\nperfectTakeWhile(-> $ < 1000)',
    ],
    seeAlso: ['number-theory.perfectSeq', 'number-theory.perfectNth', 'number-theory.isPerfect'],
  },
  'perfectNth': {
    category: 'number-theory',
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
      'let { perfectNth } = import(number-theory);\nperfectNth(1)',
      'let { perfectNth } = import(number-theory);\nperfectNth(5)',
    ],
    seeAlso: ['number-theory.perfectSeq', 'number-theory.perfectTakeWhile', 'number-theory.isPerfect'],
  },
  'isPerfect': {
    category: 'number-theory',
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
      'let { isPerfect } = import(number-theory);\nisPerfect(0)',
      'let { isPerfect } = import(number-theory);\nisPerfect(1)',
      'let { isPerfect } = import(number-theory);\nisPerfect(2)',
      'let { isPerfect } = import(number-theory);\nisPerfect(3)',
      'let { isPerfect } = import(number-theory);\nisPerfect(4)',
      'let { isPerfect } = import(number-theory);\nisPerfect(5)',
      'let { isPerfect } = import(number-theory);\nisPerfect(6)',
      'let { isPerfect } = import(number-theory);\nisPerfect(7)',
      'let { isPerfect } = import(number-theory);\nisPerfect(8)',
      'let { isPerfect } = import(number-theory);\nisPerfect(9)',
    ],
    seeAlso: ['number-theory.perfectSeq', 'number-theory.perfectNth', 'number-theory.isAbundant', 'number-theory.isDeficient', 'number-theory.sigma', 'number-theory.perfectTakeWhile', 'number-theory.isAmicable', 'number-theory.properDivisors'],
  },
  'perfectSquareSeq': {
    category: 'number-theory',
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
      'let { perfectSquareSeq } = import(number-theory);\nperfectSquareSeq(5)',
      'let { perfectSquareSeq } = import(number-theory);\nperfectSquareSeq(20)',
    ],
    seeAlso: ['number-theory.perfectSquareNth', 'number-theory.perfectSquareTakeWhile', 'number-theory.isPerfectSquare', 'number-theory.perfectCubeSeq', 'number-theory.perfectPowerSeq', 'number-theory.polygonalSeq'],
  },
  'perfectSquareTakeWhile': {
    category: 'number-theory',
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
      'let { perfectSquareTakeWhile } = import(number-theory);\nperfectSquareTakeWhile(-> $ <= 100)',
    ],
    seeAlso: ['number-theory.perfectSquareSeq', 'number-theory.perfectSquareNth', 'number-theory.isPerfectSquare'],
  },
  'perfectSquareNth': {
    category: 'number-theory',
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
      'let { perfectSquareNth } = import(number-theory);\nperfectSquareNth(1)',
      'let { perfectSquareNth } = import(number-theory);\nperfectSquareNth(5)',
    ],
    seeAlso: ['number-theory.perfectSquareSeq', 'number-theory.perfectSquareTakeWhile', 'number-theory.isPerfectSquare'],
  },
  'isPerfectSquare': {
    category: 'number-theory',
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
      'let { isPerfectSquare } = import(number-theory);\nisPerfectSquare(16)',
      'let { isPerfectSquare } = import(number-theory);\nisPerfectSquare(20)',
    ],
    seeAlso: ['number-theory.perfectSquareSeq', 'number-theory.perfectSquareNth', 'number-theory.isPerfectCube', 'number-theory.isPerfectPower', 'number-theory.perfectSquareTakeWhile', 'number-theory.perfectPower', 'number-theory.isPolygonal'],
  },
  'perfectCubeSeq': {
    category: 'number-theory',
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
      'let { perfectCubeSeq } = import(number-theory);\nperfectCubeSeq(5)',
      'let { perfectCubeSeq } = import(number-theory);\nperfectCubeSeq(20)',
    ],
    seeAlso: ['number-theory.perfectCubeNth', 'number-theory.perfectCubeTakeWhile', 'number-theory.isPerfectCube', 'number-theory.perfectSquareSeq', 'number-theory.perfectPowerSeq'],
  },
  'perfectCubeTakeWhile': {
    category: 'number-theory',
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
      'let { perfectCubeTakeWhile } = import(number-theory);\nperfectCubeTakeWhile(-> $ <= 100)',
    ],
    seeAlso: ['number-theory.perfectCubeSeq', 'number-theory.perfectCubeNth', 'number-theory.isPerfectCube'],
  },
  'perfectCubeNth': {
    category: 'number-theory',
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
      'let { perfectCubeNth } = import(number-theory);\nperfectCubeNth(1)',
      'let { perfectCubeNth } = import(number-theory);\nperfectCubeNth(5)',
    ],
    seeAlso: ['number-theory.perfectCubeSeq', 'number-theory.perfectCubeTakeWhile', 'number-theory.isPerfectCube'],
  },
  'isPerfectCube': {
    category: 'number-theory',
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
      'let { isPerfectCube } = import(number-theory);\nisPerfectCube(7)',
      'let { isPerfectCube } = import(number-theory);\nisPerfectCube(8)',
      'let { isPerfectCube } = import(number-theory);\nisPerfectCube(9)',
    ],
    seeAlso: ['number-theory.perfectCubeSeq', 'number-theory.perfectCubeNth', 'number-theory.isPerfectSquare', 'number-theory.isPerfectPower', 'number-theory.perfectCubeTakeWhile', 'number-theory.perfectPower'],
  },
  'perfectPowerSeq': {
    category: 'number-theory',
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
      'let { perfectPowerSeq } = import(number-theory);\nperfectPowerSeq(5)',
      'let { perfectPowerSeq } = import(number-theory);\nperfectPowerSeq(20)',
    ],
    seeAlso: ['number-theory.perfectPowerNth', 'number-theory.perfectPowerTakeWhile', 'number-theory.isPerfectPower', 'number-theory.perfectPower', 'number-theory.perfectSquareSeq', 'number-theory.perfectCubeSeq'],
  },
  'perfectPowerTakeWhile': {
    category: 'number-theory',
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
      'let { perfectPowerTakeWhile } = import(number-theory);\nperfectPowerTakeWhile(-> $ <= 100)',
    ],
    seeAlso: ['number-theory.perfectPowerSeq', 'number-theory.perfectPowerNth', 'number-theory.isPerfectPower'],
  },
  'perfectPowerNth': {
    category: 'number-theory',
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
      'let { perfectPowerNth } = import(number-theory);\nperfectPowerNth(3)',
      'let { perfectPowerNth } = import(number-theory);\nperfectPowerNth(15)',
    ],
    seeAlso: ['number-theory.perfectPowerSeq', 'number-theory.perfectPowerTakeWhile', 'number-theory.isPerfectPower'],
  },
  'isPerfectPower': {
    category: 'number-theory',
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
      'let { isPerfectPower } = import(number-theory);\nisPerfectPower(7)',
      'let { isPerfectPower } = import(number-theory);\nisPerfectPower(8)',
      'let { isPerfectPower } = import(number-theory);\nisPerfectPower(9)',
      'let { isPerfectPower } = import(number-theory);\nisPerfectPower(10)',
    ],
    seeAlso: ['number-theory.perfectPowerSeq', 'number-theory.perfectPowerNth', 'number-theory.perfectPower', 'number-theory.isPerfectSquare', 'number-theory.isPerfectCube', 'number-theory.perfectPowerTakeWhile'],
  },
  'polygonalSeq': {
    category: 'number-theory',
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
      'let { polygonalSeq } = import(number-theory);\npolygonalSeq(3, 2)',
      'let { polygonalSeq } = import(number-theory);\npolygonalSeq(4, 2)',
      'let { polygonalSeq } = import(number-theory);\npolygonalSeq(5, 3)',
      'let { polygonalSeq } = import(number-theory);\npolygonalSeq(6, 5)',
      'let { polygonalSeq } = import(number-theory);\npolygonalSeq(100, 10)',
    ],
    seeAlso: ['number-theory.polygonalNth', 'number-theory.polygonalTakeWhile', 'number-theory.isPolygonal', 'number-theory.perfectSquareSeq'],
  },
  'polygonalTakeWhile': {
    category: 'number-theory',
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
      'let { polygonalTakeWhile } = import(number-theory);\npolygonalTakeWhile(15, -> $ < 1000)',
    ],
    seeAlso: ['number-theory.polygonalSeq', 'number-theory.polygonalNth', 'number-theory.isPolygonal'],
  },
  'polygonalNth': {
    category: 'number-theory',
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
      'let { polygonalNth } = import(number-theory);\npolygonalNth(3, 9)',
      'let { polygonalNth } = import(number-theory);\npolygonalNth(4, 5)',
      'let { polygonalNth } = import(number-theory);\npolygonalNth(5, 5)',
    ],
    seeAlso: ['number-theory.polygonalSeq', 'number-theory.polygonalTakeWhile', 'number-theory.isPolygonal'],
  },
  'isPolygonal': {
    category: 'number-theory',
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
      'let { isPolygonal } = import(number-theory);\nisPolygonal(3, 10)',
      'let { isPolygonal } = import(number-theory);\nisPolygonal(3, 9)',
      'let { isPolygonal } = import(number-theory);\nisPolygonal(4, 10000)',
      'let { isPolygonal } = import(number-theory);\nisPolygonal(4, 1000)',
      'let { isPolygonal } = import(number-theory);\nisPolygonal(6, 45)',
    ],
    seeAlso: ['number-theory.polygonalSeq', 'number-theory.polygonalNth', 'number-theory.isPerfectSquare', 'number-theory.polygonalTakeWhile'],
  },
  'primeSeq': {
    category: 'number-theory',
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
      'let { primeSeq } = import(number-theory);\nprimeSeq(1)',
      'let { primeSeq } = import(number-theory);\nprimeSeq(2)',
      'let { primeSeq } = import(number-theory);\nprimeSeq(10)',
    ],
    seeAlso: ['number-theory.primeNth', 'number-theory.primeTakeWhile', 'number-theory.isPrime', 'number-theory.compositeSeq', 'number-theory.mersenneSeq', 'number-theory.luckySeq'],
  },
  'primeTakeWhile': {
    category: 'number-theory',
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
      'let { primeTakeWhile } = import(number-theory);\nprimeTakeWhile(-> $ < 50)',
    ],
    seeAlso: ['number-theory.primeSeq', 'number-theory.primeNth', 'number-theory.isPrime'],
  },
  'primeNth': {
    category: 'number-theory',
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
      'let { primeNth } = import(number-theory);\nprimeNth(1)',
      'let { primeNth } = import(number-theory);\nprimeNth(2)',
      'let { primeNth } = import(number-theory);\nprimeNth(10)',
    ],
    seeAlso: ['number-theory.primeSeq', 'number-theory.primeTakeWhile', 'number-theory.isPrime'],
  },
  'isPrime': {
    category: 'number-theory',
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
      'let { isPrime } = import(number-theory);\nisPrime(1)',
      'let { isPrime } = import(number-theory);\nisPrime(2)',
      'let { isPrime } = import(number-theory);\nisPrime(3)',
      'let { isPrime } = import(number-theory);\nisPrime(4)',
      'let { isPrime } = import(number-theory);\nisPrime(997)',
      'let { isPrime } = import(number-theory);\nisPrime(1001)',
    ],
    seeAlso: ['number-theory.primeSeq', 'number-theory.primeNth', 'number-theory.isComposite', 'number-theory.primeFactors', 'number-theory.isMersenne', 'number-theory.primeTakeWhile', 'number-theory.isLucky'],
  },
  'recamanSeq': {
    category: 'number-theory',
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
      'let { recamanSeq } = import(number-theory);\nrecamanSeq(5)',
      'let { recamanSeq } = import(number-theory);\nrecamanSeq(10)',
      'let { recamanSeq } = import(number-theory);\nrecamanSeq(20)',
    ],
    seeAlso: ['number-theory.recamanNth', 'number-theory.recamanTakeWhile', 'number-theory.isRecaman', 'number-theory.golombSeq'],
  },
  'recamanTakeWhile': {
    category: 'number-theory',
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
      'let { recamanTakeWhile } = import(number-theory);\nrecamanTakeWhile(-> $ < 10)',
    ],
    seeAlso: ['number-theory.recamanSeq', 'number-theory.recamanNth', 'number-theory.isRecaman'],
  },
  'recamanNth': {
    category: 'number-theory',
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
      'let { recamanNth } = import(number-theory);\nrecamanNth(5)',
      'let { recamanNth } = import(number-theory);\nrecamanNth(10)',
      'let { recamanNth } = import(number-theory);\nrecamanNth(20)',
    ],
    seeAlso: ['number-theory.recamanSeq', 'number-theory.recamanTakeWhile', 'number-theory.isRecaman'],
  },
  'isRecaman': {
    category: 'number-theory',
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
      'let { isRecaman } = import(number-theory);\nisRecaman(5)',
      'let { isRecaman } = import(number-theory);\nisRecaman(10)',
      'let { isRecaman } = import(number-theory);\nisRecaman(20)',
    ],
    seeAlso: ['number-theory.recamanSeq', 'number-theory.recamanNth', 'number-theory.recamanTakeWhile'],
  },
  'sylvesterSeq': {
    category: 'number-theory',
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
      'let { sylvesterSeq } = import(number-theory);\nsylvesterSeq(5)',
      'let { sylvesterSeq } = import(number-theory);\nsylvesterSeq()',
      'let { sylvesterSeq } = import(number-theory);\nsylvesterSeq()',
    ],
    seeAlso: ['number-theory.sylvesterNth', 'number-theory.sylvesterTakeWhile', 'number-theory.isSylvester'],
  },
  'sylvesterTakeWhile': {
    category: 'number-theory',
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
      'let { sylvesterTakeWhile } = import(number-theory);\nsylvesterTakeWhile(-> $ < 100000)',
    ],
    seeAlso: ['number-theory.sylvesterSeq', 'number-theory.sylvesterNth', 'number-theory.isSylvester'],
  },
  'sylvesterNth': {
    category: 'number-theory',
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
      'let { sylvesterNth } = import(number-theory);\nsylvesterNth(1)',
      'let { sylvesterNth } = import(number-theory);\nsylvesterNth(5)',
    ],
    seeAlso: ['number-theory.sylvesterSeq', 'number-theory.sylvesterTakeWhile', 'number-theory.isSylvester'],
  },
  'isSylvester': {
    category: 'number-theory',
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
      'let { isSylvester } = import(number-theory);\nisSylvester(2)',
      'let { isSylvester } = import(number-theory);\nisSylvester(3)',
      'let { isSylvester } = import(number-theory);\nisSylvester(6)',
    ],
    seeAlso: ['number-theory.sylvesterSeq', 'number-theory.sylvesterNth', 'number-theory.sylvesterTakeWhile'],
  },
  'thueMorseSeq': {
    category: 'number-theory',
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
      'let { thueMorseSeq } = import(number-theory);\nthueMorseSeq(5)',
      'let { thueMorseSeq } = import(number-theory);\nthueMorseSeq(10)',
      'let { thueMorseSeq } = import(number-theory);\nthueMorseSeq(20)',
    ],
    seeAlso: ['number-theory.thueMorseNth', 'number-theory.thueMorseTakeWhile', 'number-theory.isThueMorse'],
  },
  'thueMorseTakeWhile': {
    category: 'number-theory',
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
      'let { thueMorseTakeWhile } = import(number-theory);\nthueMorseTakeWhile(-> $2 < 10)',
    ],
    seeAlso: ['number-theory.thueMorseSeq', 'number-theory.thueMorseNth', 'number-theory.isThueMorse'],
  },
  'thueMorseNth': {
    category: 'number-theory',
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
      'let { thueMorseNth } = import(number-theory);\nthueMorseNth(5)',
      'let { thueMorseNth } = import(number-theory);\nthueMorseNth(10)',
      'let { thueMorseNth } = import(number-theory);\nthueMorseNth(20)',
    ],
    seeAlso: ['number-theory.thueMorseSeq', 'number-theory.thueMorseTakeWhile', 'number-theory.isThueMorse'],
  },
  'isThueMorse': {
    category: 'number-theory',
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
      'let { isThueMorse } = import(number-theory);\nisThueMorse(1)',
      'let { isThueMorse } = import(number-theory);\nisThueMorse(2)',
    ],
    seeAlso: ['number-theory.thueMorseSeq', 'number-theory.thueMorseNth', 'number-theory.thueMorseTakeWhile'],
  },
  'tribonacciSeq': {
    category: 'number-theory',
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
      'let { tribonacciSeq } = import(number-theory);\ntribonacciSeq(1)',
      'let { tribonacciSeq } = import(number-theory);\ntribonacciSeq(2)',
      'let { tribonacciSeq } = import(number-theory);\ntribonacciSeq(10)',
    ],
    seeAlso: ['number-theory.tribonacciNth', 'number-theory.tribonacciTakeWhile', 'number-theory.isTribonacci', 'number-theory.fibonacciSeq'],
  },
  'tribonacciTakeWhile': {
    category: 'number-theory',
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
      'let { tribonacciTakeWhile } = import(number-theory);\ntribonacciTakeWhile(-> $ < 100)',
    ],
    seeAlso: ['number-theory.tribonacciSeq', 'number-theory.tribonacciNth', 'number-theory.isTribonacci'],
  },
  'tribonacciNth': {
    category: 'number-theory',
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
      'let { tribonacciNth } = import(number-theory);\ntribonacciNth(1)',
      'let { tribonacciNth } = import(number-theory);\ntribonacciNth(2)',
      'let { tribonacciNth } = import(number-theory);\ntribonacciNth(10)',
    ],
    seeAlso: ['number-theory.tribonacciSeq', 'number-theory.tribonacciTakeWhile', 'number-theory.isTribonacci'],
  },
  'isTribonacci': {
    category: 'number-theory',
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
      'let { isTribonacci } = import(number-theory);\nisTribonacci(0)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(1)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(2)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(3)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(4)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(5)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(6)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(7)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(8)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(9)',
      'let { isTribonacci } = import(number-theory);\nisTribonacci(10)',
    ],
    seeAlso: ['number-theory.tribonacciSeq', 'number-theory.tribonacciNth', 'number-theory.isFibonacci', 'number-theory.tribonacciTakeWhile'],
  },
  'countCombinations': {
    category: 'number-theory',
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
      'let { countCombinations } = import(number-theory);\ncountCombinations(5, 3)',
      'let { countCombinations } = import(number-theory);\ncountCombinations(10, 2)',
    ],
    seeAlso: ['number-theory.combinations', 'number-theory.countPermutations', 'number-theory.factorial', 'number-theory.multinomial', 'number-theory.stirlingSecond', 'number-theory.countPartitions', 'number-theory.countPowerSet'],
  },
  'combinations': {
    category: 'number-theory',
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
      'let { combinations } = import(number-theory);\ncombinations([1, 2, 3], 2)',
      'let { combinations } = import(number-theory);\ncombinations(["a", "b", "c"], 2)',
      'let { combinations } = import(number-theory);\ncombinations([1, 2, 3], 0)',
      'let { combinations } = import(number-theory);\ncombinations([1, 2, 3], 1)',
      'let { combinations } = import(number-theory);\ncombinations([1, 2, 3], 3)',
    ],
    seeAlso: ['number-theory.countCombinations', 'number-theory.permutations', 'number-theory.powerSet', 'number-theory.cartesianProduct', 'number-theory.partitions'],
  },
  'countDerangements': {
    category: 'number-theory',
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
      'let { countDerangements } = import(number-theory);\ncountDerangements(4)',
      'let { countDerangements } = import(number-theory);\ncountDerangements(5)',
    ],
    seeAlso: ['number-theory.derangements', 'number-theory.countPermutations', 'number-theory.factorial'],
  },
  'derangements': {
    category: 'number-theory',
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
      'let { derangements } = import(number-theory);\nderangements([1, 2, 3, 4])',
      'let { derangements } = import(number-theory);\nderangements(["a", "b", "c"])',
    ],
    seeAlso: ['number-theory.countDerangements', 'number-theory.permutations'],
  },
  'divisors': {
    category: 'number-theory',
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
      'let { divisors } = import(number-theory);\ndivisors(12)',
      'let { divisors } = import(number-theory);\ndivisors(100)',
      'let { divisors } = import(number-theory);\ndivisors(37)',
    ],
    seeAlso: ['number-theory.countDivisors', 'number-theory.properDivisors', 'number-theory.sigma', 'number-theory.primeFactors', 'number-theory.isDivisibleBy', 'number-theory.lcm', 'number-theory.isAbundant', 'number-theory.isDeficient', 'number-theory.countProperDivisors'],
  },
  'countDivisors': {
    category: 'number-theory',
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
      'let { countDivisors } = import(number-theory);\ncountDivisors(12)',
      'let { countDivisors } = import(number-theory);\ncountDivisors(100)',
      'let { countDivisors } = import(number-theory);\ncountDivisors(37)',
    ],
    seeAlso: ['number-theory.divisors', 'number-theory.countProperDivisors', 'number-theory.sigma'],
  },
  'properDivisors': {
    category: 'number-theory',
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
      'let { properDivisors } = import(number-theory);\nproperDivisors(12)',
      'let { properDivisors } = import(number-theory);\nproperDivisors(100)',
      'let { properDivisors } = import(number-theory);\nproperDivisors(37)',
    ],
    seeAlso: ['number-theory.countProperDivisors', 'number-theory.divisors', 'number-theory.isAmicable', 'number-theory.isPerfect'],
  },
  'countProperDivisors': {
    category: 'number-theory',
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
      'let { countProperDivisors } = import(number-theory);\ncountProperDivisors(12)',
      'let { countProperDivisors } = import(number-theory);\ncountProperDivisors(100)',
      'let { countProperDivisors } = import(number-theory);\ncountProperDivisors(37)',
    ],
    seeAlso: ['number-theory.properDivisors', 'number-theory.countDivisors', 'number-theory.divisors'],
  },
  'factorial': {
    category: 'number-theory',
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
      'let { factorial } = import(number-theory);\nfactorial(5)',
      'let { factorial } = import(number-theory);\nfactorial(0)',
      'let { factorial } = import(number-theory);\nfactorial(10)',
      'let { factorial } = import(number-theory);\nfactorial(20)',
    ],
    seeAlso: ['number-theory.factorialSeq', 'number-theory.factorialNth', 'number-theory.isFactorial', 'number-theory.countCombinations', 'number-theory.countPermutations', 'number-theory.multinomial', 'number-theory.countDerangements'],
  },
  'partitions': {
    category: 'number-theory',
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
      'let { partitions } = import(number-theory);\npartitions(4)',
      'let { partitions } = import(number-theory);\npartitions(8)',
    ],
    seeAlso: ['number-theory.countPartitions', 'number-theory.partitionSeq', 'number-theory.combinations', 'number-theory.isPartition'],
  },
  'countPartitions': {
    category: 'number-theory',
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
      'let { countPartitions } = import(number-theory);\ncountPartitions(4)',
      'let { countPartitions } = import(number-theory);\ncountPartitions(8)',
      'let { countPartitions } = import(number-theory);\ncountPartitions(15)',
    ],
    seeAlso: ['number-theory.partitions', 'number-theory.partitionSeq', 'number-theory.countCombinations'],
  },
  'permutations': {
    category: 'number-theory',
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
      'let { permutations } = import(number-theory);\npermutations([1, 2, 3])',
      'let { permutations } = import(number-theory);\npermutations(["a", "b", "c"])',
      'let { permutations } = import(number-theory);\npermutations([1, 2, 3, 4])',
      'let { permutations } = import(number-theory);\npermutations([1, 2])',
      'let { permutations } = import(number-theory);\npermutations([1])',
      'let { permutations } = import(number-theory);\npermutations([])',
    ],
    seeAlso: ['number-theory.countPermutations', 'number-theory.combinations', 'number-theory.derangements', 'number-theory.cartesianProduct'],
  },
  'countPermutations': {
    category: 'number-theory',
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
      'let { countPermutations } = import(number-theory);\ncountPermutations(5, 3)',
      'let { countPermutations } = import(number-theory);\ncountPermutations(10, 2)',
      'let { countPermutations } = import(number-theory);\ncountPermutations(10, 10)',
      'let { countPermutations } = import(number-theory);\ncountPermutations(10, 0)',
      'let { countPermutations } = import(number-theory);\ncountPermutations(10, 1)',
    ],
    seeAlso: ['number-theory.permutations', 'number-theory.countCombinations', 'number-theory.factorial', 'number-theory.multinomial', 'number-theory.stirlingFirst', 'number-theory.countDerangements'],
  },
  'powerSet': {
    category: 'number-theory',
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
      'let { powerSet } = import(number-theory);\npowerSet(["a", "b", "c"])',
      'let { powerSet } = import(number-theory);\npowerSet([1, 2])',
      'let { powerSet } = import(number-theory);\npowerSet([1])',
      'let { powerSet } = import(number-theory);\npowerSet([])',
    ],
    seeAlso: ['number-theory.countPowerSet', 'number-theory.combinations', 'number-theory.cartesianProduct'],
  },
  'countPowerSet': {
    category: 'number-theory',
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
      'let { countPowerSet } = import(number-theory);\ncountPowerSet(3)',
      'let { countPowerSet } = import(number-theory);\ncountPowerSet(5)',
      'let { countPowerSet } = import(number-theory);\ncountPowerSet(10)',
    ],
    seeAlso: ['number-theory.powerSet', 'number-theory.countCombinations'],
  },
  'primeFactors': {
    category: 'number-theory',
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
      'let { primeFactors } = import(number-theory);\nprimeFactors(12)',
      'let { primeFactors } = import(number-theory);\nprimeFactors(100)',
      'let { primeFactors } = import(number-theory);\nprimeFactors(37)',
    ],
    seeAlso: ['number-theory.countPrimeFactors', 'number-theory.distinctPrimeFactors', 'number-theory.isPrime', 'number-theory.divisors', 'number-theory.eulerTotient', 'number-theory.mobius', 'number-theory.isComposite', 'number-theory.countDistinctPrimeFactors'],
  },
  'countPrimeFactors': {
    category: 'number-theory',
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
      'let { countPrimeFactors } = import(number-theory);\ncountPrimeFactors(12)',
      'let { countPrimeFactors } = import(number-theory);\ncountPrimeFactors(100)',
      'let { countPrimeFactors } = import(number-theory);\ncountPrimeFactors(37)',
    ],
    seeAlso: ['number-theory.primeFactors', 'number-theory.distinctPrimeFactors', 'number-theory.countDistinctPrimeFactors'],
  },
  'distinctPrimeFactors': {
    category: 'number-theory',
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
      'let { distinctPrimeFactors } = import(number-theory);\ndistinctPrimeFactors(12)',
      'let { distinctPrimeFactors } = import(number-theory);\ndistinctPrimeFactors(100)',
      'let { distinctPrimeFactors } = import(number-theory);\ndistinctPrimeFactors(37)',
    ],
    seeAlso: ['number-theory.primeFactors', 'number-theory.countDistinctPrimeFactors', 'number-theory.countPrimeFactors'],
  },
  'countDistinctPrimeFactors': {
    category: 'number-theory',
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
      'let { countDistinctPrimeFactors } = import(number-theory);\ncountDistinctPrimeFactors(12)',
      'let { countDistinctPrimeFactors } = import(number-theory);\ncountDistinctPrimeFactors(100)',
      'let { countDistinctPrimeFactors } = import(number-theory);\ncountDistinctPrimeFactors(37)',
    ],
    seeAlso: ['number-theory.distinctPrimeFactors', 'number-theory.primeFactors', 'number-theory.countPrimeFactors'],
  },
  'isCoprime': {
    category: 'number-theory',
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
      'let { isCoprime } = import(number-theory);\nisCoprime(12, 8)',
      'let { isCoprime } = import(number-theory);\nisCoprime(12, 5)',
      'let { isCoprime } = import(number-theory);\nisCoprime(37, 1)',
      'let { isCoprime } = import(number-theory);\nisCoprime(0, 0)',
      'let { isCoprime } = import(number-theory);\nisCoprime(0, 5)',
      'let { isCoprime } = import(number-theory);\nisCoprime(5, 0)',
      'let { isCoprime } = import(number-theory);\nisCoprime(1, 0)',
      'let { isCoprime } = import(number-theory);\nisCoprime(0, 1)',
      'let { isCoprime } = import(number-theory);\nisCoprime(1, 1)',
      'let { isCoprime } = import(number-theory);\nisCoprime(2, 3)',
    ],
    seeAlso: ['number-theory.gcd', 'number-theory.eulerTotient', 'number-theory.isDivisibleBy', 'number-theory.lcm', 'number-theory.carmichaelLambda'],
  },
  'isDivisibleBy': {
    category: 'number-theory',
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
      'let { isDivisibleBy } = import(number-theory);\nisDivisibleBy(12, 4)',
      'let { isDivisibleBy } = import(number-theory);\nisDivisibleBy(12, 5)',
      'let { isDivisibleBy } = import(number-theory);\nisDivisibleBy(37, 1)',
      'let { isDivisibleBy } = import(number-theory);\nisDivisibleBy(0, 0)',
      'let { isDivisibleBy } = import(number-theory);\nisDivisibleBy(0, 5)',
      'let { isDivisibleBy } = import(number-theory);\nisDivisibleBy(5, 0)',
    ],
    seeAlso: ['number-theory.divisors', 'number-theory.gcd', 'number-theory.isCoprime'],
  },
  'gcd': {
    category: 'number-theory',
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
      'let { gcd } = import(number-theory);\ngcd(100, 25)',
      'let { gcd } = import(number-theory);\ngcd(37, 1)',
      'let { gcd } = import(number-theory);\ngcd(0, 0)',
      'let { gcd } = import(number-theory);\ngcd(0, 5)',
      'let { gcd } = import(number-theory);\ngcd(5, 0)',
    ],
    seeAlso: ['number-theory.lcm', 'number-theory.extendedGcd', 'number-theory.isCoprime', 'number-theory.isDivisibleBy'],
  },
  'lcm': {
    category: 'number-theory',
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
      'let { lcm } = import(number-theory);\nlcm(100, 25)',
      'let { lcm } = import(number-theory);\nlcm(37, 1)',
      'let { lcm } = import(number-theory);\nlcm(0, 5)',
      'let { lcm } = import(number-theory);\nlcm(5, 0)',
    ],
    seeAlso: ['number-theory.gcd', 'number-theory.divisors', 'number-theory.isCoprime'],
  },
  'multinomial': {
    category: 'number-theory',
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
      'let { multinomial } = import(number-theory);\nmultinomial(5, 2, 3)',
      'let { multinomial } = import(number-theory);\nmultinomial(10, 2, 3, 5)',
    ],
    seeAlso: ['number-theory.countCombinations', 'number-theory.factorial', 'number-theory.countPermutations'],
    hideOperatorForm: true,
  },
  'isAmicable': {
    category: 'number-theory',
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
      'let { isAmicable } = import(number-theory);\nisAmicable(220, 284)',
      'let { isAmicable } = import(number-theory);\nisAmicable(1184, 1210)',
      'let { isAmicable } = import(number-theory);\nisAmicable(2620, 2924)',
      'let { isAmicable } = import(number-theory);\nisAmicable(5020, 5564)',
      'let { isAmicable } = import(number-theory);\nisAmicable(6232, 6368)',
    ],
    seeAlso: ['number-theory.properDivisors', 'number-theory.isPerfect', 'number-theory.sigma', 'number-theory.perfectSeq'],
  },
  'eulerTotient': {
    category: 'number-theory',
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
      'let { eulerTotient } = import(number-theory);\neulerTotient(1)',
      'let { eulerTotient } = import(number-theory);\neulerTotient(2)',
      'let { eulerTotient } = import(number-theory);\neulerTotient(10)',
      'let { eulerTotient } = import(number-theory);\neulerTotient(20)',
    ],
    seeAlso: ['number-theory.isCoprime', 'number-theory.carmichaelLambda', 'number-theory.mobius', 'number-theory.primeFactors', 'number-theory.mertens'],
  },
  'mobius': {
    category: 'number-theory',
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
      'let { mobius } = import(number-theory);\nmobius(1)',
      'let { mobius } = import(number-theory);\nmobius(2)',
      'let { mobius } = import(number-theory);\nmobius(3)',
      'let { mobius } = import(number-theory);\nmobius(4)',
      'let { mobius } = import(number-theory);\nmobius(6)',
      'let { mobius } = import(number-theory);\nmobius(12)',
      'let { mobius } = import(number-theory);\nmobius(30)',
    ],
    seeAlso: ['number-theory.mertens', 'number-theory.eulerTotient', 'number-theory.primeFactors'],
  },
  'mertens': {
    category: 'number-theory',
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
      'let { mobius } = import(number-theory);\nmobius(1)',
      'let { mobius } = import(number-theory);\nmobius(2)',
      'let { mobius } = import(number-theory);\nmobius(3)',
      'let { mobius } = import(number-theory);\nmobius(4)',
      'let { mobius } = import(number-theory);\nmobius(6)',
      'let { mobius } = import(number-theory);\nmobius(12)',
      'let { mobius } = import(number-theory);\nmobius(30)',
    ],
    seeAlso: ['number-theory.mobius', 'number-theory.eulerTotient'],
  },
  'sigma': {
    category: 'number-theory',
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
      'let { sigma } = import(number-theory);\nsigma(1)',
      'let { sigma } = import(number-theory);\nsigma(2)',
      'let { sigma } = import(number-theory);\nsigma(3)',
      'let { sigma } = import(number-theory);\nsigma(4)',
      'let { sigma } = import(number-theory);\nsigma(6)',
      'let { sigma } = import(number-theory);\nsigma(12)',
      'let { sigma } = import(number-theory);\nsigma(30)',
    ],
    seeAlso: ['number-theory.divisors', 'number-theory.isPerfect', 'number-theory.isAbundant', 'number-theory.isDeficient', 'number-theory.isAmicable', 'number-theory.countDivisors'],
  },
  'carmichaelLambda': {
    category: 'number-theory',
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
      'let { carmichaelLambda } = import(number-theory);\ncarmichaelLambda(1)',
      'let { carmichaelLambda } = import(number-theory);\ncarmichaelLambda(2)',
      'let { carmichaelLambda } = import(number-theory);\ncarmichaelLambda(3)',
      'let { carmichaelLambda } = import(number-theory);\ncarmichaelLambda(4)',
      'let { carmichaelLambda } = import(number-theory);\ncarmichaelLambda(6)',
      'let { carmichaelLambda } = import(number-theory);\ncarmichaelLambda(12)',
      'let { carmichaelLambda } = import(number-theory);\ncarmichaelLambda(30)',
    ],
    seeAlso: ['number-theory.eulerTotient', 'number-theory.modExp', 'number-theory.isCoprime'],
  },
  'cartesianProduct': {
    category: 'number-theory',
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
      'let { cartesianProduct } = import(number-theory);\ncartesianProduct([1, 2], ["a", "b"])',
      'let { cartesianProduct } = import(number-theory);\ncartesianProduct([1, 2], ["a", "b"], [true, false])',
      'let { cartesianProduct } = import(number-theory);\ncartesianProduct([1, 2, 3], ["x", "y", "z"])',
    ],
    seeAlso: ['number-theory.combinations', 'number-theory.powerSet', 'number-theory.permutations'],
  },
  'perfectPower': {
    category: 'number-theory',
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
      'let { perfectPower } = import(number-theory);\nperfectPower(1)',
      'let { perfectPower } = import(number-theory);\nperfectPower(2)',
      'let { perfectPower } = import(number-theory);\nperfectPower(4)',
      'let { perfectPower } = import(number-theory);\nperfectPower(8)',
      'let { perfectPower } = import(number-theory);\nperfectPower(9)',
      'let { perfectPower } = import(number-theory);\nperfectPower(16)',
      'let { perfectPower } = import(number-theory);\nperfectPower(19)',
    ],
    seeAlso: ['number-theory.isPerfectPower', 'number-theory.perfectPowerSeq', 'number-theory.isPerfectSquare', 'number-theory.isPerfectCube'],
  },
  'modExp': {
    category: 'number-theory',
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
      'let { modExp } = import(number-theory);\nmodExp(2, 3, 5)',
      'let { modExp } = import(number-theory);\nmodExp(3, 4, 7)',
      'let { modExp } = import(number-theory);\nmodExp(5, 6, 11)',
      'let { modExp } = import(number-theory);\nmodExp(7, 8, 13)',
    ],
    seeAlso: ['number-theory.modInv', 'number-theory.carmichaelLambda', 'number-theory.chineseRemainder'],
  },
  'modInv': {
    category: 'number-theory',
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
      'let { modInv } = import(number-theory);\nmodInv(3, 11)',
      'let { modInv } = import(number-theory);\nmodInv(10, 17)',
      'let { modInv } = import(number-theory);\nmodInv(5, 13)',
      'let { modInv } = import(number-theory);\nmodInv(7, 19)',
    ],
    seeAlso: ['number-theory.modExp', 'number-theory.extendedGcd', 'number-theory.chineseRemainder'],
  },
  'extendedGcd': {
    category: 'number-theory',
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
      'let { extendedGcd } = import(number-theory);\nextendedGcd(30, 12)',
      'let { extendedGcd } = import(number-theory);\nextendedGcd(56, 98)',
      'let { extendedGcd } = import(number-theory);\nextendedGcd(101, 10)',
      'let { extendedGcd } = import(number-theory);\nextendedGcd(17, 13)',
    ],
    seeAlso: ['number-theory.gcd', 'number-theory.modInv', 'number-theory.chineseRemainder'],
  },
  'chineseRemainder': {
    category: 'number-theory',
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
      'let { chineseRemainder } = import(number-theory);\nchineseRemainder([2, 3], [3, 5])',
      'let { chineseRemainder } = import(number-theory);\nchineseRemainder([1, 2], [3, 4])',
      'let { chineseRemainder } = import(number-theory);\nchineseRemainder([0, 1], [2, 3])',
      'let { chineseRemainder } = import(number-theory);\nchineseRemainder([1, 2, 3], [4, 5, 7])',
    ],
    seeAlso: ['number-theory.modExp', 'number-theory.modInv', 'number-theory.extendedGcd'],
  },
  'stirlingFirst': {
    category: 'number-theory',
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
      'let { stirlingFirst } = import(number-theory);\nstirlingFirst(5, 2)',
      'let { stirlingFirst } = import(number-theory);\nstirlingFirst(4, 3)',
      'let { stirlingFirst } = import(number-theory);\nstirlingFirst(6, 1)',
      'let { stirlingFirst } = import(number-theory);\nstirlingFirst(7, 4)',
      'let { stirlingFirst } = import(number-theory);\nstirlingFirst(8, 5)',
    ],
    seeAlso: ['number-theory.stirlingSecond', 'number-theory.bellSeq', 'number-theory.countPermutations'],
  },
  'stirlingSecond': {
    category: 'number-theory',
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
      'let { stirlingSecond } = import(number-theory);\nstirlingSecond(5, 2)',
      'let { stirlingSecond } = import(number-theory);\nstirlingSecond(4, 3)',
      'let { stirlingSecond } = import(number-theory);\nstirlingSecond(6, 1)',
      'let { stirlingSecond } = import(number-theory);\nstirlingSecond(7, 4)',
      'let { stirlingSecond } = import(number-theory);\nstirlingSecond(8, 5)',
    ],
    seeAlso: ['number-theory.stirlingFirst', 'number-theory.bellSeq', 'number-theory.countCombinations'],
  },
}
