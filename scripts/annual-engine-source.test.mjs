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
  }
})
