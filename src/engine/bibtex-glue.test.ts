import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard against #152: the published BibTeX worker controller silently drifted from
 * its authored source, dropping the `max_print_line = 1000` texmf.cnf line. That regression
 * corrupts acmart / long-`.bst` bibliographies for `github:`/prebuilt-`lib/` consumers.
 *
 * The authored controller and generated Emscripten module are separate files. This lets
 * us compare the published controller byte-for-byte without requiring the WASM toolchain.
 */
const ROOT = join(import.meta.dirname, '..', '..')
const CONTROLLER = join(ROOT, 'wasm-build', 'bibtex-worker.js')
const PUBLISHED_2025 = join(ROOT, 'public', 'wasmtex', '2025', 'wasmtex-bibtex.worker.js')

// (name, must-appear regex) — invariants the worker MUST carry to compile real bibliographies.
const INVARIANTS: Array<[string, RegExp]> = [
  // Don't wrap .bbl output — long `%%%` .bst banners must stay on one line (acmart). #152
  ['max_print_line = 1000', /max_print_line = 1000/],
  // Retry kpse lookups on any >=400 so `ACM-Reference-Format` resolves to `.bst`
  // even when a mirror uses a non-404 missing-object response.
  ['status >= 400 retry', /status\s*>=\s*400/],
]

describe('published BibTeX worker controller (#152)', () => {
  it('the authored controller carries the invariants', () => {
    const controller = readFileSync(CONTROLLER, 'utf8')
    for (const [name, re] of INVARIANTS) expect(controller, name).toMatch(re)
  })

  // The published engine set is gitignored (binaries are quarantined from version
  // control), so this drift check runs only where the assets are staged — dev
  // machines and CI's deploy job after the engine artifacts are downloaded.
  it.runIf(existsSync(PUBLISHED_2025))(
    'the published 2025 controller exactly matches its authored source',
    () => {
      expect(readFileSync(PUBLISHED_2025)).toEqual(readFileSync(CONTROLLER))
    },
  )
})
