#!/usr/bin/env node
// One-off diagnostic: compile a single case with the XeTeX engine and capture the
// actual CDN requests (url + status) the worker makes, plus the full log.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const caseDir = process.argv[2] || join(root, 'compat/corpus/needs-xelatex-fontspec')

const server = await createServer({ root, configFile: join(root, 'vite.config.ts') })
await server.listen()
const url = `http://localhost:${server.httpServer.address().port}/compat/harness.html`
const browser = await chromium.launch()
const page = await browser.newPage()

const reqs = []
page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/pdftex/')) reqs.push(`${r.status()} ${u.split('/').slice(-3).join('/')}`)
})
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser:error]', m.text().slice(0, 200)) })

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !!window.__compat, null, { timeout: 60000 })

const main = readFileSync(join(caseDir, 'main.tex'), 'utf8')
const res = await page.evaluate((m) => window.__compat.compile({ text: { 'main.tex': m }, mainFile: 'main.tex' }), main)

console.log('\n=== CDN requests during compile (status path) ===')
const counts = {}
for (const r of reqs) counts[r.split(' ')[0]] = (counts[r.split(' ')[0]] || 0) + 1
console.log('status counts:', JSON.stringify(counts))
console.log('first 40 requests:')
for (const r of reqs.slice(0, 40)) console.log('  ' + r)
console.log('\n=== fontlist/fmt requests ===')
for (const r of reqs.filter((x) => /fontlist|\.fmt|lmroman|HaranoAji/i.test(x))) console.log('  ' + r)
console.log('\n=== non-200 requests ===')
for (const r of reqs.filter((x) => !x.startsWith('200'))) console.log('  ' + r)
console.log(
  `\n=== RESULT: success=${res.success} hasPdf=${res.hasPdf} pdfBytes=${res.pdfBytes} ms=${res.compileTime} ===`,
)
console.log('\n=== full log (tail) ===')
console.log(res.log.slice(-1800))

await browser.close()
await server.close()
