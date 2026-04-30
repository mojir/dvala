import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fileStorage from './fileStorage'
import type { WorkspaceFile } from './fileStorage'
import { playgroundFileResolver, resolvePlaygroundPath } from './playgroundFileResolver'

const file = (path: string, code = ''): WorkspaceFile => ({
  id: path,
  path,
  code,
  context: '',
  createdAt: 0,
  updatedAt: 0,
  locked: false,
})

describe('resolvePlaygroundPath', () => {
  it('resolves a sibling import at the root', () => {
    expect(resolvePlaygroundPath('', './foo')).toBe('foo')
  })

  it('resolves a sibling import inside a folder', () => {
    expect(resolvePlaygroundPath('examples', './foo')).toBe('examples/foo')
  })

  it('walks up via `..` segments', () => {
    expect(resolvePlaygroundPath('a/b/c', '../foo')).toBe('a/b/foo')
    expect(resolvePlaygroundPath('a/b', '../../foo')).toBe('foo')
  })

  it('throws when `..` walks past the workspace root', () => {
    expect(() => resolvePlaygroundPath('a', '../../foo')).toThrow(/escapes workspace root/)
    expect(() => resolvePlaygroundPath('', '../foo')).toThrow(/escapes workspace root/)
  })

  it('treats a leading `/` as absolute (relative to workspace root)', () => {
    expect(resolvePlaygroundPath('a/b', '/foo')).toBe('foo')
    expect(resolvePlaygroundPath('a/b', '/x/y')).toBe('x/y')
  })

  it('collapses `.` and empty segments', () => {
    expect(resolvePlaygroundPath('a', './b/./c')).toBe('a/b/c')
    expect(resolvePlaygroundPath('', 'a//b')).toBe('a/b')
  })
})

describe('playgroundFileResolver', () => {
  let restoreFiles: (() => void) | null = null

  function withFiles(files: WorkspaceFile[]): void {
    const spy = vi.spyOn(fileStorage, 'getWorkspaceFiles').mockReturnValue(files)
    restoreFiles = () => spy.mockRestore()
  }

  beforeEach(() => {
    restoreFiles = null
  })

  afterEach(() => {
    restoreFiles?.()
  })

  it('returns the file content when an exact match exists', () => {
    withFiles([file('util.dvala', 'EXACT')])
    expect(playgroundFileResolver('./util.dvala', '')).toBe('EXACT')
  })

  it('falls back to the .dvala suffix when the import omits it', () => {
    withFiles([file('util.dvala', 'WITH-EXT')])
    expect(playgroundFileResolver('./util', '')).toBe('WITH-EXT')
  })

  it("resolves imports relative to the importing file's folder", () => {
    withFiles([file('examples/util.dvala', 'NESTED')])
    expect(playgroundFileResolver('./util', 'examples')).toBe('NESTED')
  })

  it('resolves cross-folder imports through `..`', () => {
    withFiles([file('lib/math.dvala', 'MATH')])
    expect(playgroundFileResolver('../lib/math', 'tests')).toBe('MATH')
  })

  it('throws a useful error when no file matches', () => {
    withFiles([file('foo.dvala', 'A')])
    expect(() => playgroundFileResolver('./bar', '')).toThrow(/File not found/)
    expect(() => playgroundFileResolver('./bar', '')).toThrow(/looked for 'bar' and 'bar.dvala'/)
  })

  // Phase 1.5 step 23g: `.dvala-playground/*` is not part of the import graph.
  describe('playground-folder import rule (23g)', () => {
    it('rejects an import from a workspace file into `.dvala-playground/`', () => {
      withFiles([file('.dvala-playground/scratch.dvala', 'SCRATCH')])
      expect(() => playgroundFileResolver('./.dvala-playground/scratch', '')).toThrow(
        /playground state, not part of the deployable project/,
      )
    })

    it('rejects an absolute-style import into `.dvala-playground/` from a nested workspace folder', () => {
      withFiles([file('.dvala-playground/handlers.dvala', 'H')])
      expect(() => playgroundFileResolver('/.dvala-playground/handlers', 'examples/sub')).toThrow(
        /playground state, not part of the deployable project/,
      )
    })

    it('rejects scratch importing handlers (inside-to-inside)', () => {
      // No real-world use case allows this — handlers is auto-wrapped, not
      // imported, and scratch is single-instance. The blanket rule keeps
      // the namespace import-free.
      withFiles([file('.dvala-playground/scratch.dvala', 'S'), file('.dvala-playground/handlers.dvala', 'H')])
      expect(() => playgroundFileResolver('./handlers', '.dvala-playground')).toThrow(
        /playground state, not part of the deployable project/,
      )
    })

    it('allows scratch to import a workspace file via `..`', () => {
      withFiles([file('.dvala-playground/scratch.dvala', 'S'), file('utils.dvala', 'UTILS')])
      expect(playgroundFileResolver('../utils', '.dvala-playground')).toBe('UTILS')
    })

    it('allows scratch to import a workspace file in a sibling folder', () => {
      withFiles([file('.dvala-playground/scratch.dvala', 'S'), file('lib/math.dvala', 'MATH')])
      expect(playgroundFileResolver('../lib/math', '.dvala-playground')).toBe('MATH')
    })

    it('mentions the offending source in the rejection message', () => {
      withFiles([file('.dvala-playground/scratch.dvala', 'S')])
      // The error names both the import path and the importing folder so
      // a user pasting code that depends on a moved-into-playground file
      // can see exactly which import to fix. Use the absolute-style `/`
      // form so the import resolves into the reserved folder (a leading
      // `./` from `examples/` would resolve to `examples/.dvala-playground`,
      // a literal sibling directory, which isn't the reserved folder).
      expect(() => playgroundFileResolver('/.dvala-playground/scratch', 'examples')).toThrow(
        /'\/\.dvala-playground\/scratch'/,
      )
      expect(() => playgroundFileResolver('/.dvala-playground/scratch', 'examples')).toThrow(/'examples'/)
    })

    it('reports `<root>` instead of empty string when the workspace-root file imports playground state', () => {
      withFiles([file('.dvala-playground/scratch.dvala', 'S')])
      expect(() => playgroundFileResolver('./.dvala-playground/scratch', '')).toThrow(/<root>/)
    })

    it('does not reject a folder that merely shares a prefix with the reserved name', () => {
      // `.dvala-playground-actually/` is a regular workspace folder. The
      // predicate's trailing-slash guard is what keeps this from getting
      // caught by the rule; this test locks that invariant in.
      withFiles([file('.dvala-playground-actually/util.dvala', 'OK')])
      expect(playgroundFileResolver('./.dvala-playground-actually/util', '')).toBe('OK')
    })

    it('rejects an import that resolves to the bare folder (no subpath)', () => {
      // `import "./.dvala-playground"` resolves to `.dvala-playground` exactly.
      // The predicate's `path === PLAYGROUND_FOLDER` branch catches it; the
      // gate fires before the file-map lookup.
      withFiles([])
      expect(() => playgroundFileResolver('./.dvala-playground', '')).toThrow(
        /playground state, not part of the deployable project/,
      )
    })

    it('fires regardless of whether the target file exists in the workspace map', () => {
      // The gate is path-based, not presence-based — this test makes that
      // contract explicit. Without it, a future refactor could accidentally
      // flip the order with the file-map lookup and turn the rejection into
      // a "file not found" for missing playground files.
      withFiles([])
      expect(() => playgroundFileResolver('/.dvala-playground/scratch', '')).toThrow(
        /playground state, not part of the deployable project/,
      )
    })

    it('error message includes a remediation hint pointing the user out of the folder', () => {
      withFiles([])
      expect(() => playgroundFileResolver('/.dvala-playground/scratch', '')).toThrow(
        /move the file outside \.dvala-playground\/ to make it importable/,
      )
    })
  })
})
