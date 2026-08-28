#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveEngineBuildMirror,
  validateEngineReleaseComponents,
} from './lib/engine-release-components.mjs'

const year = process.env.TEXLIVE_YEAR ?? '2025'
const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'engine-release-components.json'), 'utf8'),
)
const release = validateEngineReleaseComponents(config, year)
const mirror = resolveEngineBuildMirror(release, year, {
  url: process.env.INPUT_TEXLIVE_URL,
  revision: process.env.INPUT_MIRROR_REVISION,
  provenanceSha256: process.env.INPUT_PROVENANCE_SHA256,
})
const values = {
  TEXLIVE_URL: mirror.url,
  TEXLIVE_MIRROR_REVISION: mirror.revision,
  TEXLIVE_PROVENANCE_SHA256: mirror.provenanceSha256,
}

if (process.env.GITHUB_ENV) {
  appendFileSync(
    process.env.GITHUB_ENV,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n')}\n`,
  )
}
console.log(`TeX Live ${year} build mirror: ${mirror.revision}`)
