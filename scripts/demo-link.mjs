#!/usr/bin/env node

/**
 * Extract demo blocks from git commit messages and generate playground URLs.
 *
 * Demos are fenced ```demo blocks in commit messages containing:
 *   description: short title
 *   code:
 *   // First comment lines serve as description for --all view
 *   let x = 42;
 *   x + 1
 *
 * Usage:
 *   npm run demo                  # open demos from HEAD in browser
 *   npm run demo -- HEAD~3       # from specific ref
 *   npm run demo -- --check      # validate all demo code runs without error
 *   npm run demo -- --all        # (future) render HTML changelog of all demos
 *
 * Options:
 *   --check     Validate demo code executes without error. No browser, no URLs.
 *   --exact     (future) Build playground from commit's version, serve on port 9902.
 *   --all       (future) Render HTML changelog from EARLIEST_DEMO_COMMIT to HEAD.
 */

import { execSync } from 'node:child_process'
import { platform } from 'node:os'

// Earliest commit with a demo block — used by --all to scan history
const EARLIEST_DEMO_COMMIT = '6fefc8af'

// Parse CLI args
const args = process.argv.slice(2)
const checkMode = args.includes('--check')
const exactMode = args.includes('--exact')
const allMode = args.includes('--all')
const positionalArgs = args.filter(a => !a.startsWith('--'))
const ref = positionalArgs[0] || 'HEAD'
const baseUrl = positionalArgs[1] || 'http://localhost:9901'

// --all mode: scan all commits from EARLIEST_DEMO_COMMIT to HEAD
if (allMode) {
  console.log('--all mode not yet implemented. Will scan from', EARLIEST_DEMO_COMMIT, 'to HEAD.')
  process.exit(0)
}

// --exact mode: not yet implemented
if (exactMode) {
  console.log('--exact mode not yet implemented.')
  process.exit(0)
}

// Get full commit message
const message = execSync(`git log -1 --format=%B ${ref}`, { encoding: 'utf-8' })

// Extract all ```demo ... ``` blocks from the message
const demos = extractDemos(message)

if (demos.length === 0) {
  console.log(`No demo blocks found in commit ${ref}`)
  process.exit(0)
}

// Print commit subject line
const subject = execSync(`git log -1 --format=%s ${ref}`, { encoding: 'utf-8' }).trim()

if (checkMode) {
  // --check: validate each demo's code runs without error
  let allPassed = true
  for (const demo of demos) {
    if (!demo.code) continue
    try {
      // Run the code through dvala via a subprocess to avoid import issues
      execSync(
        `node -e "${escapeForShell(`
          const { createDvala, allBuiltinModules } = require('./dist/full.js');
          const dvala = createDvala({ modules: allBuiltinModules });
          dvala.run(${JSON.stringify(demo.code)});
        `)}"`,
        { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 },
      )
      console.log(`  ✅ ${demo.description || '(no description)'}`)
    } catch (e) {
      console.log(`  ❌ ${demo.description || '(no description)'}`)
      console.log(`     ${e.stderr?.trim() || e.message}`)
      allPassed = false
    }
  }
  process.exit(allPassed ? 0 : 1)
}

// Default mode: print URLs and open in browser
console.log(`\n  ${subject}\n`)

for (const demo of demos) {
  // Build playground state from demo fields
  const state = {}
  if (demo.code) state['dvala-code'] = demo.code
  if (demo.context) state['context'] = demo.context

  // Encode state as base64(encodeURIComponent(JSON.stringify(state)))
  const encoded = btoa(encodeURIComponent(JSON.stringify(state)))
  const url = `${baseUrl}/?state=${encoded}`

  if (demo.description) {
    console.log(`  ${demo.description}`)
  }
  console.log(`  ${url}\n`)

  // Open each demo in the default browser
  const openCmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open'
  try {
    execSync(`${openCmd} "${url}"`, { stdio: 'ignore' })
  } catch {
    // Silently ignore if browser can't be opened (e.g., headless environment)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all ```demo blocks from a commit message.
 * Handles both direct extraction and extraction after a --- separator.
 */
function extractDemos(message) {
  const demoRegex = /```demo\n([\s\S]*?)```/g
  const demos = []
  let match
  while ((match = demoRegex.exec(message)) !== null) {
    demos.push(parseDemo(match[1]))
  }
  return demos
}

/**
 * Parse the contents of a single ```demo block into structured fields.
 * Recognized fields: description, code, context, handlers (alias for context).
 * Lines after a field header are appended to that field until the next header.
 */
function parseDemo(block) {
  const demo = { description: '', code: '', context: '' }
  let currentField = null
  const lines = block.split('\n')

  for (const line of lines) {
    // Check for field headers: "description:", "code:", "context:", "handlers:"
    const fieldMatch = line.match(/^(description|code|context|handlers):\s*(.*)/)
    if (fieldMatch) {
      currentField = fieldMatch[1]
      const rest = fieldMatch[2].trim()
      // "handlers" is an alias for "context" in the playground state
      if (currentField === 'handlers') currentField = 'context'
      if (rest) demo[currentField] = rest
    } else if (currentField) {
      // Continuation line — append to current field
      demo[currentField] += (demo[currentField] ? '\n' : '') + line
    }
  }

  // Trim trailing whitespace from all fields
  for (const key of Object.keys(demo)) {
    demo[key] = demo[key].trim()
  }

  return demo
}

/**
 * Escape a string for safe embedding in a shell double-quoted string.
 * Handles backticks, dollar signs, and double quotes.
 */
function escapeForShell(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}
