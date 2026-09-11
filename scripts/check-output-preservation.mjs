#!/usr/bin/env node
/**
 * Does a new engine release typeset the same as the one it replaces?
 *
 * A pinned profile exists so an author's output cannot move under them. That
 * guarantee is about what the engine *produces*, and some releases change only
 * how the host reads what was produced — the job-name output fix (#107) is one:
 * the compile always succeeded, and the PDF was read from a path that was never
 * written. Holding every existing project on a release like that holds them on
 * a defect for no benefit.
 *
 * This decides which kind a release is, by measurement rather than by reading
 * the diff. It compiles a corpus against both engine asset sets and compares
 * the PDFs. Three fields cannot be reproducible and are removed before the
 * comparison: the creation date, the modification date, and the document ID.
 * Everything else — every glyph, every position — must match exactly.
 *
 * Usage:
 *   node scripts/check-output-preservation.mjs \
 *     --baseline <dir> --candidate <dir> \
 *     --texlive-url <url> [--texlive-version 2026] [--engine pdflatex]
 *
 *   --baseline    engine assets of the release being replaced
 *   --candidate   engine assets of the new release
 *
 * Exits non-zero when any document differs, when either side fails to compile,
 * or when the corpus is empty. A zero exit is the evidence a host needs to move
 * projects forward automatically.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (value === undefined || value.startsWith('--')) return fallback
  return value
}

function fail(message) {
  console.error(`output preservation: ${message}`)
  process.exit(1)
}

/**
 * The parts of a PDF that cannot repeat between two runs. Everything outside
 * them is the typeset result, and that is what must be identical.
 */
function typesetDigest(pdf) {
  const text = Buffer.from(pdf)
    .toString('latin1')
    .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
    .replace(/\/ID\s*\[[^\]]*\]/g, '')
  return createHash('sha256').update(text).digest('hex')
}

/** Every `.tex` file in the corpus directory, as one single-file document. */
function corpusDocuments(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.tex'))
    .sort()
    .map((name) => ({ name, source: readFileSync(join(directory, name), 'utf8') }))
}

async function compileWith({ assets, document, engine, texliveUrl, texliveVersion }) {
  const { installNodeWorkerHost } = await import('../lib/node.js')
  const { WasmTexCompiler } = await import('../lib/headless.js')
  const assetBaseUrl = 'http://assets.local/'
  installNodeWorkerHost({ publicDir: assets, assetBaseUrl })
  // Compile from inside a folder as well as at the root: a release that reads
  // its output by the wrong name only fails for the nested one, and a corpus
  // that never nests would call that release output-preserving.
  const results = []
  const scope = arg('scope', 'all')
  if (!['all', 'root', 'nested'].includes(scope)) throw Error('Scope must be all, root, or nested')
  const mainFiles = scope === 'root' ? ['main.tex'] : scope === 'nested' ? ['nested/main.tex'] : ['main.tex', 'nested/main.tex']
  for (const mainFile of mainFiles) {
    const compiler = new WasmTexCompiler({
      assetBaseUrl,
      engine,
      files: { [mainFile]: document.source },
      mainFile,
      texliveUrl,
      texliveVersion,
    })
    try {
      await compiler.init()
      const result = await compiler.compile()
      results.push({
        mainFile,
        digest: result.pdf ? typesetDigest(result.pdf) : null,
        bytes: result.pdf?.length ?? 0,
        success: result.success,
        pdfBase64: arg('report') && result.pdf ? Buffer.from(result.pdf).toString('base64') : undefined,
        log: result.log, errors: result.errors, diagnostics: result.telemetry?.diagnostics,
      })
    } finally {
      compiler.dispose()
    }
  }
  return results
}

async function main() {
  const baseline = arg('baseline')
  const candidate = arg('candidate')
  const texliveUrl = arg('texlive-url')
  const texliveVersion = arg('texlive-version', '2026')
  const engine = arg('engine', 'pdflatex')
  const corpus = arg('corpus', join(root, 'test/fixtures/output-preservation'))
  if (!baseline || !candidate || !texliveUrl) {
    fail('--baseline, --candidate and --texlive-url are required')
  }

  const documents = corpusDocuments(corpus)
  if (documents.length === 0) fail(`no .tex documents in ${corpus}`)

  const differences = []
  const comparisons = []
  for (const document of documents) {
    const before = await compileWith({
      assets: baseline,
      document,
      engine,
      texliveUrl,
      texliveVersion,
    })
    const after = await compileWith({
      assets: candidate,
      document,
      engine,
      texliveUrl,
      texliveVersion,
    })
    comparisons.push({ document: document.name, before, after })
    for (const [index, baselineRun] of before.entries()) {
      const candidateRun = after[index]
      const where = `${document.name} (${baselineRun.mainFile})`
      // A baseline that produced nothing is not a difference in typesetting —
      // it is the defect being fixed, and the candidate is free to improve on
      // it. Only a changed result, or a candidate that lost one, fails.
      if (!candidateRun.success || candidateRun.digest === null) {
        differences.push(`${where}: candidate produced no PDF`)
        continue
      }
      if (baselineRun.digest !== null && baselineRun.digest !== candidateRun.digest) {
        differences.push(
          `${where}: typeset output changed (${baselineRun.digest.slice(0, 16)} -> ${candidateRun.digest.slice(0, 16)})`,
        )
      }
      const verdict =
        baselineRun.digest === null
          ? 'recovered'
          : baselineRun.digest === candidateRun.digest
            ? 'identical'
            : 'CHANGED'
      console.log(
        `${verdict.padEnd(9)} ${where}  ${candidateRun.bytes} bytes  ${candidateRun.digest.slice(0, 16)}`,
      )
    }
  }

  const report = arg('report')
  if (report) writeFileSync(report, JSON.stringify({ baseline, candidate, engine, texliveVersion, texliveUrl, scope: arg('scope', 'all'), comparisons, differences }, null, 2))

  if (differences.length > 0) {
    fail(`this release changes what it typesets:\n- ${differences.join('\n- ')}`)
  }
  console.log(
    `\nOutput preserved across ${documents.length} document(s), scope=${arg('scope', 'all')}. This is scoped evidence, not release qualification.`,
  )
}

await main()
