import { vi } from 'vitest'

// Globally suppress console output during tests to keep test output clean.
// Individual tests can still spy on these methods to assert logging behavior.
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})
