# Collections

Dvala has three collection types: arrays, objects, and strings. All are immutable — every operation returns a new collection.

## Arrays

Arrays are ordered, mixed-type collections. Access elements by index:

```dvala
let arr = [10, 20, 30, 40];
get(arr, 2);
```

```dvala
first([1, 2, 3]);
```

```dvala
rest([1, 2, 3]);
```

## Map, Filter, Reduce

The core trio for transforming collections:

```dvala
map([1, 2, 3, 4], -> $ * $);
```

```dvala
filter([1, 2, 3, 4, 5, 6], isEven);
```

```dvala
reduce([1, 2, 3, 4], +, 0);
```

## More Sequence Operations

Slicing, reversing, sorting, and more:

```dvala
slice([10, 20, 30, 40, 50], 1, 4);
```

```dvala
reverse([1, 2, 3]);
```

```dvala
sort([3, 1, 4, 1, 5]);
```

## Building Arrays

Generate arrays with `range`, `repeat`, and `push`:

```dvala
range(5);
```

```dvala
range(2, 10, 3);
```

```dvala
repeat("x", 4);
```

```dvala
push([1, 2], 3, 4);
```

## Objects

Objects are key-value maps. Use `get`, `assoc`, and `dissoc` to work with them:

```dvala
let user = { name: "Alice", age: 30 };
user.name;
```

```dvala
let user = { name: "Alice", age: 30 };
assoc(user, "age", 31);
```

```dvala
keys({ a: 1, b: 2, c: 3 });
```

```dvala
vals({ a: 1, b: 2, c: 3 });
```

## Merging Objects

Combine objects with `merge` — later keys win:

```dvala
merge({ a: 1, b: 2 }, { b: 3, c: 4 });
```

## Finding Elements

`some` returns the **first element matching a predicate**, or `null` if none match:

```dvala
some([1, 3, 4, 7], isEven);
```

```dvala
some([1, 3, 5], isEven);
```

To check whether *all* elements satisfy a predicate, combine `filter` and `count`:

```dvala
let xs = [2, 4, 6];
count(filter(xs, isEven)) == count(xs);
```

## Flattening

`flatten` collapses one level of nesting. Combine with `map` for a flatMap pattern:

```dvala
flatten([[1, 2], [3, 4], [5]]);
```

```dvala
flatten(map([1, 2, 3], (x) -> [x, x * 10]));
```

## Collection Predicates

Test properties of collections:

```dvala
isEmpty([]);
```

```dvala
contains([1, 2, 3], 1);
```

```dvala
count("hello");
```
