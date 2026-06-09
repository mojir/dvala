import { isGlobalDvalaCoverageEnabled } from '@mojir/dvala-core-tooling'
import { DVALA_COVERAGE_DIR, writeDvalaCoverageReport } from '@mojir/dvala-test-framework'

/**
 * vitest globalSetup for the `.dvala` builtin union-coverage baseline.
 *
 * Active only under DVALA_COVERAGE=1. The returned teardown runs in the main
 * process AFTER all workers exit (and have flushed their per-worker dumps via
 * vitest.setup.ts), then merges them into the `coverage-dvala/` report. No-op
 * otherwise — the file is always listed in vitest config but stays inert.
 */
export default function setup(): () => void {
  if (!isGlobalDvalaCoverageEnabled()) return () => {}
  return () => {
    const summary = writeDvalaCoverageReport()
    if (summary) {
      // eslint-disable-next-line no-console
      console.log(`\n${summary}\n→ ${DVALA_COVERAGE_DIR}\n`)
    }
  }
}
