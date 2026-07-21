#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2] ?? '2025'
const metricsFlag = process.argv.indexOf('--metrics')
const metricsPath = metricsFlag >= 0 ? process.argv[metricsFlag + 1] : null
const budgetPath = resolve(root, `scripts/engine-performance-budgets-${version}.json`)
const assetDirectory = resolve(root, `public/wasmtex/${version}`)
const failures = []

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function fail(message) {
  failures.push(message)
}

const budget = readJson(budgetPath)
if (budget.schemaVersion !== 1 || budget.texliveYear !== version) {
  fail(`invalid performance budget metadata for TeX Live ${version}`)
}

for (const [name, maximum] of Object.entries(budget.artifactBytes ?? {})) {
  const path = resolve(assetDirectory, name)
  if (!existsSync(path)) {
    fail(`missing release artifact: ${name}`)
    continue
  }
  const actual = statSync(path).size
  if (!Number.isSafeInteger(maximum) || maximum <= 0) {
    fail(`${name}: invalid byte budget`)
  } else if (actual > maximum) {
    fail(`${name}: ${actual} bytes exceeds ${maximum}`)
  }
}

if (metricsPath) {
  const metrics = readJson(resolve(root, metricsPath))
  if (metrics.schemaVersion !== 1 || metrics.texliveYear !== version) {
    fail('runtime metrics metadata does not match the budget')
  }
  for (const [engine, limits] of Object.entries(budget.runtime ?? {})) {
    const sample = metrics.engines?.[engine]
    if (!sample) {
      fail(`runtime metrics omit ${engine}`)
      continue
    }
    if (!sample.success || sample.pdfBytes <= 0) {
      fail(`${engine}: measured compile did not produce a PDF`)
    }
    for (const metric of ['initMs', 'firstCompileMs', 'secondCompileMs', 'peakRssMiB']) {
      const actual = sample[metric]
      const maximum = limits[metric]
      if (!Number.isFinite(actual) || actual < 0) {
        fail(`${engine}: invalid ${metric}`)
      } else if (actual > maximum) {
        fail(`${engine}: ${metric}=${actual} exceeds ${maximum}`)
      }
    }
  }
}

if (failures.length) {
  for (const message of failures) console.error(`performance budget: ${message}`)
  process.exit(1)
}
console.log(
  `Engine performance budget passed (${Object.keys(budget.artifactBytes).length} artifacts${metricsPath ? ', runtime metrics' : ''}).`,
)
