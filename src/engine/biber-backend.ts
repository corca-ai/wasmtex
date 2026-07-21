import type { BackendRegistry } from './backend-registry'
import { createJsonTextBackend, type ToolBackend } from './backend-registry'
import { BIBLIOGRAPHY_STAGE } from './bibliography-backend'

/**
 * Biber as a server-first pluggable backend (M4 / #116, execution-model principle 3).
 *
 * Biber is Perl + Text::BibTeX (the C `btparse`) + a large CPAN tree — intractable to
 * ship to WASM, NOT in the hot interactive loop, and deterministic. That makes it the
 * ideal **server offload**: an integrator points {@link createBiberBackend} at an endpoint
 * running Biber; the client default stays the bundled biblatex-lite (so nothing leaves
 * the device unless a backend is wired). Because the endpoint runs the same deterministic
 * Biber, its `.bbl` is reproducible — content-addressable for a shared cache (S5 #112).
 *
 * Unlike the legacy `BibliographyBackend.generateBbl` (entry-level, synchronous), Biber
 * is **file-level**: it consumes the `.bcf` control file (emitted by the first LaTeX pass)
 * plus the `.bib` databases and emits the `.bbl`.
 */
export interface BiberRequest {
  /** The `.bcf` (biblatex control file) emitted by the first LaTeX pass — references the
   *  `.bib` files and carries the biblatex options Biber needs. */
  bcf: string
  /** The `.bib` database files, keyed by filename. */
  bibFiles: Record<string, string>
}

export interface BiberBackendOptions {
  /** Integrator endpoint that runs Biber and returns the `.bbl`. */
  endpoint: string
  /** Injectable for tests / non-global-fetch hosts. */
  fetchImpl?: typeof fetch
  /** Content-address key (e.g. a hash of the `.bcf` + `.bib`s) so a shared cache can
   *  dedupe identical Biber runs (S5 #112). */
  cacheKey?: (request: BiberRequest) => string
}

/** Build a server Biber backend for the `bibliography` stage. */
export function createBiberBackend(opts: BiberBackendOptions): ToolBackend<BiberRequest, string> {
  return createJsonTextBackend<BiberRequest>({
    id: 'biber',
    stage: BIBLIOGRAPHY_STAGE,
    endpoint: opts.endpoint,
    fetchImpl: opts.fetchImpl,
    cacheKey: opts.cacheKey,
  })
}

/**
 * Route a biblatex document's bibliography stage through a **server** Biber backend: if the
 * integrator registered one for {@link BIBLIOGRAPHY_STAGE}, run it on the `.bcf`-based
 * {@link BiberRequest} and return the `.bbl`; otherwise return `null` so the caller falls
 * back to the bundled biblatex-lite. Keeps the client-first default non-negotiable — a remote
 * Biber runs only when the integrator explicitly wired one. The `.bcf` sibling of
 * `runRemoteBibliography` (classic `.aux` flow); extracted so the routing is unit-testable
 * without a WASM engine.
 */
export async function runRemoteBiber(
  registry: BackendRegistry | undefined,
  request: BiberRequest,
): Promise<string | null> {
  const backend = registry?.resolve<BiberRequest, string>(BIBLIOGRAPHY_STAGE)
  if (!backend || backend.location !== 'server') return null
  return backend.run(request)
}
