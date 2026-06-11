import { afterAll, vi } from 'vitest'
import { getGlobalDvalaHits, isGlobalDvalaCoverageEnabled } from '@mojir/dvala-core-tooling'
import { dumpWorkerCoverage } from '@mojir/dvala-test-framework'

// Globally suppress console output during tests to keep test output clean.
// Individual tests can still spy on these methods to assert logging behavior.
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// Suppress process.stdout/stderr.write — used by Dvala I/O effects (print, println, error)
vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

// `.dvala` union-coverage baseline: when DVALA_COVERAGE=1, every createDvala in this
// worker records into a process-global union map. Flush it to disk after each test
// file (cumulative — the per-pid dump is overwritten with the full map), so the
// globalSetup teardown (separate, main process) can merge all workers' dumps.
if (isGlobalDvalaCoverageEnabled()) {
  afterAll(() => {
    dumpWorkerCoverage(getGlobalDvalaHits())
  })
}
