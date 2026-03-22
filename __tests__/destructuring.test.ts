import { describe, expect, test } from 'vitest'
import { createDvala } from '../src/createDvala'
import { gridModule } from '../src/builtin/modules/grid'
import { DvalaError } from '../src/errors'

const dvala = createDvala({ modules: [gridModule] })

describe('dvala Destructuring', () => {
  // Basic object destructuring
  describe('basic object destructuring', () => {
    test('simple property extraction', () => {
      expect(dvala.run(`
        let { name } = { name: "Alice" };
        name
      `)).toBe('Alice')
    })

    test('multiple property extraction', () => {
      expect(dvala.run(`
        let { name, age } = { name: "Bob", age: 30 };
        name ++ " is " ++ str(age)
      `)).toBe('Bob is 30')
    })

    test('property not in object returns null', () => {
      expect(dvala.run(`
        let { missing } = { name: "Charlie" };
        missing
      `)).toBe(null)
    })
  })

  // Renaming with 'as'
  describe('renaming with "as"', () => {
    test('basic property renaming', () => {
      expect(dvala.run(`
        let { name as userName } = { name: "Dave" };
        userName
      `)).toBe('Dave')
    })

    test('multiple renames', () => {
      expect(dvala.run(`
        let { firstName as name, age as years } = { firstName: "Eve", age: 28 };
        name ++ " is " ++ str(years) ++ " years old"
      `)).toBe('Eve is 28 years old')
    })

    test('renaming with original property name still inaccessible', () => {
      expect(() => dvala.run(`
        let { name as userName } = { name: "Frank" };
        name
      `)).toThrow()
    })
  })

  // Default values
  describe('default values', () => {
    test('default when property is missing', () => {
      expect(dvala.run(`
        let { name = "Anonymous" } = {};
        name
      `)).toBe('Anonymous')
    })

    test('default not used when property exists', () => {
      expect(dvala.run(`
        let { name = "Anonymous" } = { name: "Grace" };
        name
      `)).toBe('Grace')
    })

    test('multiple defaults', () => {
      expect(dvala.run(`
        let { name = "Anonymous", age = 0 } = {};
        name ++ ":" ++ str(age)
      `)).toBe('Anonymous:0')
    })

    test('null values does not use default', () => {
      expect(dvala.run(`
        let { name = "Anonymous" } = { name: null };
        name
      `)).toBeNull()
    })
  })

  // Combining renaming and defaults
  describe('combining renaming and defaults', () => {
    test('rename with default', () => {
      expect(dvala.run(`
        let { name as userName = "Anonymous" } = {};
        userName
      `)).toBe('Anonymous')
    })

    test('rename with existing value', () => {
      expect(dvala.run(`
        let { name as userName = "Anonymous" } = { name: "Helen" };
        userName
      `)).toBe('Helen')
    })
  })

  // Nested destructuring
  describe('nested destructuring', () => {
    test('basic nested property', () => {
      expect(dvala.run(`
        let { user: { name }} = { user: { name: "Ian" }};
        name
      `)).toBe('Ian')
    })

    test('multiple nested properties', () => {
      expect(dvala.run(`
        let { user: { name, age }} = { user: { name: "Jane", age: 27 }};
        name ++ ":" ++ str(age)
      `)).toBe('Jane:27')
    })

    test('deeply nested properties', () => {
      expect(dvala.run(`
        let { user: { profile: { email }}} = { user: { profile: { email: "kevin@example.com" }}};
        email
      `)).toBe('kevin@example.com')
    })

    test('nested property from missing parent throws', () => {
      expect(() => dvala.run(`
        let { user: { name }}: {};
        name
      `)).toThrow(DvalaError)
    })
  })

  // Defaults in nested structures
  describe('defaults in nested structures', () => {
    test('default for nested property', () => {
      expect(dvala.run(`
        let { user: { name = "Anonymous" }} = { user: {}};
        name
      `)).toBe('Anonymous')
    })

    test('default for entire nested object', () => {
      expect(dvala.run(`
        let { user = { name: "Anonymous" }} = {};
        user.name
      `)).toBe('Anonymous')
    })

    test('default for nested structure pattern', () => {
      expect(dvala.run(`
        let { user: { name } = { name: "Default" }} = {};
        name
      `)).toBe('Default')
    })
  })

  // Array destructuring
  describe('array destructuring', () => {
    test('basic array elements', () => {
      expect(dvala.run(`
        let [one, two] = [1, 2, 3];
        one + two
      `)).toBe(3)
    })

    test('skipping elements', () => {
      expect(dvala.run(`
        let [one, , third] = [1, 2, 3];
        one + third
      `)).toBe(4)
    })

    test('elements beyond array length are null', () => {
      expect(dvala.run(`
        let [one, two, third] = [1];
        [one, two, third]
      `)).toEqual([1, null, null])
    })
  })

  // Array defaults
  describe('array destructuring with defaults', () => {
    test('default for missing array element', () => {
      expect(dvala.run(`
        let [one, two = 2] = [1];
        one + two
      `)).toBe(3)
    })

    test('multiple defaults in arrays', () => {
      expect(dvala.run(`
        let [one = 1, two = 2] = [];
        one + two
      `)).toBe(3)
    })

    test('default for skipped element', () => {
      expect(dvala.run(`
        let [, two = 2] = [];
        two
      `)).toBe(2)
    })
  })

  // Rest pattern
  describe('rest pattern', () => {
    test('basic rest in array', () => {
      expect(dvala.run(`
        let [one, ...others] = [1, 2, 3, 4];
        [one, others]
      `)).toEqual([1, [2, 3, 4]])
    })

    test('empty rest in array', () => {
      expect(dvala.run(`
        let [one, ...others] = [1];
        [one, others]
      `)).toEqual([1, []])
    })

    test('rest in object', () => {
      expect(dvala.run(`
        let { name, ...others } = { name: "Linda", age: 31, city: "Boston" };
        [name, others]
      `)).toEqual(['Linda', { age: 31, city: 'Boston' }])
    })

    test('empty rest in object', () => {
      expect(dvala.run(`
        let { name, ...others } = { name: "Marcus" };
        [name, others]
      `)).toEqual(['Marcus', {}])
    })
  })

  // Function parameters
  describe('destructuring in function parameters', () => {
    test('basic parameter destructuring', () => {
      expect(dvala.run(`
        let greet = ({ name }) -> do
          "Hello, " ++ name;
        end;
        greet({ name: "Pat" });
      `)).toBe('Hello, Pat')
    })

    test('parameter with default', () => {
      expect(dvala.run(`
        let greet = ({ name = "friend" }) -> do
          "Hello, " ++ name;
        end;
        greet({});
      `)).toBe('Hello, friend')
    })

    test('parameter with rename', () => {
      expect(dvala.run(`
        let foo = ({ a as b = 10 }) -> do
          b;
        end;
        foo({ b: 1 });
      `)).toBe(10)
    })

    test('nested parameter destructuring', () => {
      expect(dvala.run(`
        let processUser = ({ profile: { name, age }}) -> do
          name ++ " is " ++ str(age);
        end;
        processUser({ profile: { name: "Quinn", age: 29 }});
      `)).toBe('Quinn is 29')
    })

    test('array parameter destructuring', () => {
      expect(dvala.run(`
        let processCoords = ([x, y]) -> do
          x + y;
        end;
        processCoords([3, 4]);
      `)).toBe(7)
    })
  })

  // Edge cases
  describe('edge cases', () => {
    test('destructuring a number should fail gracefully', () => {
      expect(dvala.run(`
        handle
          let { value } = 42
        with [(arg, eff, nxt) -> if eff == @dvala.error then "Error caught" else nxt(eff, arg) end]
        end
      `)).toBe('Error caught')
    })

    test('destructuring shadowing', () => {
      expect(dvala.run(`
        let name = "outer";
        let result = do
          let { name } = { name: "inner" };
          name;
        end;
        [name, result]
      `)).toEqual(['outer', 'inner'])
    })

    test('empty destructuring pattern', () => {
      expect(dvala.run(`
        let {} = { a: 1 };
        "No error"
      `)).toBe('No error')
    })

    test('empty array destructuring', () => {
      expect(dvala.run(`
        let [] = [1, 2, 3];
        "No error"
      `)).toBe('No error')
    })
  })

  // Combinations
  describe('complex combinations', () => {
    test('mix of all features', () => {
      expect(dvala.run(`
        let { 
          name as userName = "Guest",
          profile: { 
            age = 0,
            contact: { email as userEmail = "none" }
          },
          settings = { theme: "light" },
          scores as userScores = [],
          ...others
        } = { name: "Sam", profile: { contact: {} }};
        
        [userName, age, userEmail, settings.theme, userScores, others]
      `)).toEqual(['Sam', 0, 'none', 'light', [], {}])
    })

    test('array and object combined', () => {
      expect(dvala.run(`
        let [{ name }, { age }] = [{ name: "Tina" }, { age: 33 }];
        name ++ " is " ++ str(age)
      `)).toBe('Tina is 33')
    })

    test('object with array property', () => {
      expect(dvala.run(`
        let { name, scores: [one, two] } = { name: "Uma", scores: [85, 92] };
        name ++ ": " ++ str(one + two)
      `)).toBe('Uma: 177')
    })
  })

  // Builtin symbol names as property keys
  describe('builtin symbol names as property keys', () => {
    test('builtin symbol with "as" alias works', () => {
      expect(dvala.run(`
        let { slice as mySlice } = { slice: 42 };
        mySlice
      `)).toBe(42)
    })

    test('multiple builtins with aliases', () => {
      expect(dvala.run(`
        let { slice as s, map as m } = { slice: 1, map: 2 };
        s + m
      `)).toBe(3)
    })

    test('builtin symbol from import with alias works', () => {
      expect(dvala.run(`
        let { isCellEvery as myEvery } = import(grid);
        myEvery([[1, 2], [3, 4]], isNumber)
      `)).toBe(true)
    })

    test('builtin and user-defined symbols mixed', () => {
      expect(dvala.run(`
        let { slice as mySlice, foo } = { slice: 10, foo: 20 };
        mySlice + foo
      `)).toBe(30)
    })

    test('builtin symbol without alias should fail', () => {
      expect(() => dvala.run(`
        let { slice } = { slice: 42 };
        slice
      `)).toThrow(DvalaError)
    })

    test('special expression symbol with alias works', () => {
      // 'if', 'let', etc. are special expressions, but we can use them as keys
      expect(dvala.run(`
        let { if as myIf } = { if: 99 };
        myIf
      `)).toBe(99)
    })
  })
})
