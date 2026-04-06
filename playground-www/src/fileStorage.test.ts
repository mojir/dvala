import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllFiles,
  getSavedFiles,
  normalizeSavedFileName,
  setSavedFiles,
  stripSavedFileSuffix,
} from './fileStorage'

describe('normalizeSavedFileName', () => {
  it('should append .dvala when it is missing', () => {
    expect(normalizeSavedFileName('example')).toBe('example.dvala')
  })

  it('should canonicalize the suffix casing', () => {
    expect(normalizeSavedFileName('example.DVALA')).toBe('example.dvala')
  })
})

describe('setSavedFiles', () => {
  beforeEach(() => {
    clearAllFiles()
  })

  it('should persist saved file names with a .dvala suffix', () => {
    setSavedFiles([
      {
        id: 'file-1',
        name: 'example',
        code: '1 + 1',
        context: '',
        createdAt: 1,
        updatedAt: 1,
        locked: false,
      },
    ])

    expect(getSavedFiles()[0]?.name).toBe('example.dvala')
  })

  it('should remove the suffix before re-appending the canonical one', () => {
    expect(stripSavedFileSuffix('example.dvala')).toBe('example')
    expect(stripSavedFileSuffix('example.DVALA')).toBe('example')
  })
})
