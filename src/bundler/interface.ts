/**
 * A bundle produced by the bundler. Contains the main program source
 * with file imports rewritten to canonical module names, plus an ordered
 * array of file module sources keyed by canonical name.
 *
 * The bundle is pure JSON — fully serializable and portable
 * (e.g., build on a server, run in a browser).
 */
export interface DvalaBundle {
  /** The main program source, with file imports rewritten to bare symbols. */
  program: string
  /** Ordered array of [canonicalName, source] pairs. Dependencies come before dependents. */
  fileModules: [string, string][]
}

export function isDvalaBundle(value: unknown): value is DvalaBundle {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as DvalaBundle).program === 'string'
    && Array.isArray((value as DvalaBundle).fileModules)
  )
}
