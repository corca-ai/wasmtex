import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolve } from 'node:path'
import { validateAnnualEngineSource } from './lib/annual-engine-source.mjs'

const root = resolve(import.meta.dirname, '..')

test('2025 and 2026 have distinct valid immutable engine pins', () => {
  const oldLine = validateAnnualEngineSource(root, '2025')
  const newLine = validateAnnualEngineSource(root, '2026')
  assert.notEqual(oldLine.ref, newLine.ref)
  assert.equal(newLine.ref, 'fb6158926661cb7a7246b3a94a0cb170a9624d5a')
  assert.equal(oldLine.config.texliveSource.xpdfVersion, '4.04')
  assert.equal(newLine.config.texliveSource.xpdfVersion, '4.06')
})

test('rejects an unsupported annual line', () => {
  assert.throws(() => validateAnnualEngineSource(root, 'latest'), /unsupported TeX Live year/)
})

test('2026 XeTeX and LuaTeX builds select the rebased WTPDF patch', () => {
  const xetexDockerfile = readFileSync(resolve(root, 'wasm-build/Dockerfile.xetex'), 'utf8')
  const luatexDockerfile = readFileSync(resolve(root, 'wasm-build/Dockerfile.luatex'), 'utf8')
  const xetexBuild = readFileSync(resolve(root, 'scripts/build-xetex-fromsource.sh'), 'utf8')
  const xetexWorkflow = readFileSync(resolve(root, '.github/workflows/wasm-xetex.yml'), 'utf8')
  const luatexWorkflow = readFileSync(resolve(root, '.github/workflows/wasm-luatex.yml'), 'utf8')
  const pdftexWorkflow = readFileSync(resolve(root, '.github/workflows/wasm-build.yml'), 'utf8')

  for (const dockerfile of [xetexDockerfile, luatexDockerfile]) {
    assert.match(dockerfile, /ARG TEXLIVE_YEAR=2025/)
    assert.match(dockerfile, /COPY patches\/texlive-wtpdf-2026\.patch/)
    assert.match(dockerfile, /\[ "\$TEXLIVE_YEAR" = 2026 \]/)
    assert.match(dockerfile, /git apply --check \/src\/patches\/texlive-wtpdf-2026\.patch/)
  }
  assert.match(xetexBuild, /--build-arg TEXLIVE_YEAR=/)
  assert.match(luatexWorkflow, /--build-arg TEXLIVE_YEAR="\$TEXLIVE_YEAR"/)
  for (const workflow of [pdftexWorkflow, xetexWorkflow, luatexWorkflow]) {
    assert.match(workflow, /BUILD-RECEIPT\.[a-z0-9-]+-raw\.json/)
    assert.match(workflow, /texlive_url:/)
    assert.match(workflow, /INPUT_TEXLIVE_URL: \$\{\{ inputs\.texlive_url \}\}/)
    assert.match(workflow, /INPUT_MIRROR_REVISION: \$\{\{ inputs\.mirror_revision \}\}/)
    assert.match(workflow, /INPUT_PROVENANCE_SHA256: \$\{\{ inputs\.provenance_sha256 \}\}/)
  }
  for (const script of ['extract-format.mjs', 'extract-xetex-format.mjs', 'extract-luatex-format.mjs']) {
    assert.match(readFileSync(resolve(root, 'scripts', script), 'utf8'), /process\.env\.TEXLIVE_URL/)
  }
})

test('all engine workflows bind builds and receipts to the selected annual source', () => {
  for (const name of [
    'wasm-build.yml',
    'wasm-bibtex8.yml',
    'wasm-makeindex.yml',
    'wasm-xetex.yml',
    'wasm-luatex.yml',
  ]) {
    const workflow = readFileSync(resolve(root, '.github/workflows', name), 'utf8')
    assert.match(workflow, /texlive_year:/, name)
    assert.match(workflow, /texlive_url:/, name)
    assert.match(workflow, /mirror_revision:/, name)
    assert.match(workflow, /provenance_sha256:/, name)
    assert.match(workflow, /TEXLIVE_YEAR: \$\{\{ inputs\.texlive_year \|\| '2025' \}\}/, name)
    assert.match(workflow, /node scripts\/configure-engine-build-mirror\.mjs/, name)
    assert.match(workflow, /INPUT_MIRROR_REVISION: \$\{\{ inputs\.mirror_revision \}\}/, name)
    assert.match(workflow, /INPUT_PROVENANCE_SHA256: \$\{\{ inputs\.provenance_sha256 \}\}/, name)
    assert.doesNotMatch(workflow, /2026-b4f6befbe7732169/, name)
    assert.doesNotMatch(workflow, /- 'scripts\/engine-release-components\.json'/, name)
    assert.doesNotMatch(workflow, new RegExp(`- '\\.github/workflows/${name}'`), name)
    assert.match(workflow, /check-annual-engine-source\.mjs "\$TEXLIVE_YEAR"/, name)
  }

  for (const name of ['wasm-bibtex8.yml', 'wasm-makeindex.yml']) {
    const workflow = readFileSync(resolve(root, '.github/workflows', name), 'utf8')
    assert.match(workflow, /texlive-source-\$TEXLIVE_YEAR\.ref/, name)
    assert.match(workflow, /env\.TEXLIVE_YEAR == '2026'/, name)
    assert.match(workflow, /gen-engine-build-receipt\.mjs/, name)
  }
})

test('corresponding-source workflow assembles the selected annual line', () => {
  const workflow = readFileSync(
    resolve(root, '.github/workflows/build-corresponding-source.yml'),
    'utf8',
  )
  assert.match(workflow, /options: \['2025', '2026'\]/)
  assert.match(workflow, /uses: \.\/\.github\/actions\/download-engine-release/)
  assert.match(workflow, /texlive-year: \$\{\{ env\.TEXLIVE_YEAR \}\}/)
  assert.match(workflow, /destination: public\/wasmtex\/\$\{\{ env\.TEXLIVE_YEAR \}\}/)
  assert.doesNotMatch(workflow, /search_artifacts:/)
  assert.match(workflow, /check-license-compliance\.mjs "\$TEXLIVE_YEAR"/)
  assert.doesNotMatch(workflow, /path: public\/wasmtex\/2026/)
})

test('release consumers download only explicitly pinned component runs', () => {
  for (const name of ['ci.yml', 'golden-canary.yml', 'build-corresponding-source.yml']) {
    const workflow = readFileSync(resolve(root, '.github/workflows', name), 'utf8')
    assert.match(workflow, /uses: \.\/\.github\/actions\/download-engine-release/, name)
    assert.doesNotMatch(workflow, /dawidd6\/action-download-artifact/, name)
    assert.doesNotMatch(workflow, /search_artifacts:/, name)
  }
})
