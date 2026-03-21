# Reduce Core Builtins

## Move to modules

1. `epoch->iso-date`, `iso-date->epoch` → `time` module (new)
2. `json-parse`, `json-stringify` → `json` module (new)
3. `sum`, `prod`, `mean`, `median` → `vector` module (existing)
4. `mapcat` → `sequence` module (existing)
5. `moving-fn`, `running-fn` → `vector` module (existing)

## Keep (reconsidered)

- `first`, `second` — heavily used in .dvala module code, good readability

## Implementation order

1. Remove `first` and `second` (simplest — just delete and migrate)
2. Move `sum`, `prod`, `mean`, `median`, `moving-fn`, `running-fn` to vector module
3. Move `mapcat` to sequence module
4. Move `epoch->iso-date`, `iso-date->epoch` to new time module
5. Move `json-parse`, `json-stringify` to new json module
6. npm run check after each step
