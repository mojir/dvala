# Reorder handler params: (arg, eff, nxt)

## Status: DONE

All handler function signatures have been migrated from `(eff, arg, nxt)` to `(arg, eff, nxt)`.
The evaluator already dispatches in `(arg, eff, nxt)` order.

## Changes made

### 1. Evaluator comments updated
- `invokeHandleWithChain`: comment updated to `handlers[0](arg, eff, nextFn)`
- `HandleNext` dispatch: comment updated to `handlers[i](arg, eff, nextNextFn)`

### 2. All handler definitions migrated
- Tests: all `(eff, arg, nxt) ->` replaced with `(arg, eff, nxt) ->`
- Tutorials, README, docs, reference: all updated
- Source files (specialExpressions docs, assertion module): all updated
