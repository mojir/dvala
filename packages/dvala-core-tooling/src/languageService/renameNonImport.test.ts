/**
 * Rename coverage for non-import destructuring (let + function params).
 *
 * The import-side cases live in WorkspaceIndex.test.ts alongside the
 * cross-file rename fixtures. This file pins the in-file behavior:
 *
 *   - Shorthand `let { pi }` / `({ pi }) -> ...`        — rename whole token
 *   - Aliased local `let { pi as p }`                   — rename local + refs
 *   - Aliased KEY in a non-import binding               — rename the key token
 *     alone (one-token edit). Not a multi-file refactor because the key is
 *     a runtime field selector, not a cross-module name.
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadFile } from './nodeWorkspaceIndexer'
import { WorkspaceIndex } from './WorkspaceIndex'

describe('rename — non-import destructuring (let + function params)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvala-rename-nonimport-'))
  const write = (name: string, content: string): string => {
    const fp = path.join(tmpDir, name)
    fs.writeFileSync(fp, content)
    return fp
  }

  function renameAt(source: string, line: number, column: number): { name: string | null; count: number } {
    const fp = write(`t-${Math.random().toString(36).slice(2)}.dvala`, source)
    const idx = new WorkspaceIndex()
    loadFile(idx, fp)
    const canon = idx.resolveCanonicalFile(fp, line, column)
    if (!canon) return { name: null, count: 0 }
    const occ = idx.findAllOccurrences(canon.file, canon.name)
    return { name: canon.name, count: occ.length }
  }

  it('shorthand let: rename whole token', () => {
    // `let { pi } = { pi: 3.14 }; pi + pi` — 1 def + 2 refs
    expect(renameAt('let { pi } = { pi: 3.14 }; pi + pi', 1, 7)).toEqual({ name: 'pi', count: 3 })
  })

  it('shorthand function param: rename whole token', () => {
    // `let f = ({ pi }) -> pi + pi` — 1 def + 2 refs
    expect(renameAt('let f = ({ pi }) -> pi + pi', 1, 12)).toEqual({ name: 'pi', count: 3 })
  })

  it('aliased let (non-import), cursor on LOCAL: renames local + refs', () => {
    // `let { pi as p } = { pi: 3.14 }; p + p` — local `p` def + 2 refs = 3
    expect(renameAt('let { pi as p } = { pi: 3.14 }; p + p', 1, 13)).toEqual({ name: 'p', count: 3 })
  })

  it('aliased let (non-import), cursor on KEY: renames just the key token', () => {
    // Cursor on `pi` (col 7) — the key is a runtime field selector, so rename
    // edits only that token. The local `p` stays, its use-sites stay. If the
    // user also wants to change the RHS literal they do so manually — this
    // rename path intentionally does not guess.
    expect(renameAt('let { pi as p } = { pi: 3.14 }; p + p', 1, 7)).toEqual({ name: 'pi', count: 1 })
  })

  it('aliased function param, cursor on LOCAL: renames local + refs', () => {
    // `let f = ({ pi as p }) -> p + p` — local `p` + 2 refs = 3
    expect(renameAt('let f = ({ pi as p }) -> p + p', 1, 18)).toEqual({ name: 'p', count: 3 })
  })

  it('aliased function param, cursor on KEY: renames just the key token', () => {
    // Cursor on `pi` (col 12). The key determines which field of the
    // argument object is extracted — a semantic change; rename only edits
    // the key token itself.
    expect(renameAt('let f = ({ pi as p }) -> p + p', 1, 12)).toEqual({ name: 'pi', count: 1 })
  })

  it('origin-file over-match: file has both `let pi` AND aliased key `pi`', () => {
    // Known limitation pinned here: when the origin file contains both a
    // direct `let pi` AND a non-import aliased destructuring whose key is
    // also `pi`, renaming the origin `pi` ALSO hits the aliased key token.
    // The origin-broad search matches by `importedName` for non-import
    // aliased bindings, which is the right thing for the isolated
    // `let { pi as p } = { pi: 3.14 }` case but over-matches when another
    // unrelated `let pi` shares the same file.
    //
    // Dispatching on the cursor's node identity (instead of name matching)
    // would fix this but requires a larger refactor of findAllOccurrences.
    // For now we pin the behaviour so future changes are intentional.
    //
    // Code: `let pi = 1; let { pi as p } = { pi: 2 }; pi + p`
    // Counted occurrences:
    //   - `let pi = 1` def           — 1
    //   - `pi` in `pi + p` use-site  — 1
    //   - aliased key `pi`           — 1 (the over-match)
    // The RHS `{ pi: 2 }` is an Object literal key, not a binding target,
    // and is not reported.
    const source = 'let pi = 1; let { pi as p } = { pi: 2 }; pi + p'
    const result = renameAt(source, 1, 5) // cursor on the first `pi`
    expect(result.name).toBe('pi')
    expect(result.count).toBeGreaterThanOrEqual(3)
  })
})
