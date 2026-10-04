#!/usr/bin/env node
// Separate memory run: sample Chromium descendants of a diagnostic command.
// Usage: node scripts/sample-browser-rss.mjs --out memory.json -- node scripts/profile-font-cpu.mjs ...
import { execFile, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { promisify } from 'node:util'

const split = process.argv.indexOf('--')
const outAt = process.argv.indexOf('--out')
if (split < 0 || outAt < 0 || outAt + 1 >= split || !process.argv[split + 1]) {
  throw Error('Required: --out <report.json> -- <command> [args...]')
}
if (!['darwin', 'linux'].includes(process.platform)) throw Error('RSS sampling requires Unix ps')
const command = process.argv.slice(split + 1)
const child = spawn(command[0], command.slice(1), { stdio: 'inherit' })
const run = promisify(execFile)
const samples = []
const started = performance.now()
let done = false
let failure = null
const completion = new Promise((resolve) => {
  child.on('error', (error) => { failure = String(error); done = true; resolve(1) })
  child.on('exit', (code, signal) => { done = true; resolve(code ?? (signal ? 1 : 0)) })
})
while (!done) {
  const { stdout } = await run('ps', ['-axo', 'pid=,ppid=,rss=,comm='])
  const processes = stdout.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), rss: Number(match[3]) * 1024, name: match[4] }] : []
  })
  // Scope to browsers launched by this command; unrelated Chrome sessions and
  // the Node server's response cache are excluded from the browser RSS total.
  const pids = new Set(processes.filter((p) => p.parent === child.pid && /chrome|chromium/i.test(p.name)).map((p) => p.pid))
  let changed = true
  while (changed) {
    changed = false
    for (const p of processes) {
      if (pids.has(p.parent) && !pids.has(p.pid)) { pids.add(p.pid); changed = true }
    }
  }
  if (pids.size) samples.push({ ms: performance.now() - started, rssBytes: processes.filter((p) => pids.has(p.pid)).reduce((sum, p) => sum + p.rss, 0), pids: [...pids] })
  if (!done) await new Promise((resolve) => setTimeout(resolve, 100))
}
const code = await completion
const peakRssBytes = samples.reduce((peak, sample) => Math.max(peak, sample.rssBytes), 0)
writeFileSync(process.argv[outAt + 1], JSON.stringify({
  command, platform: process.platform, node: process.version, minimumSampleIntervalMs: 100,
  exitCode: code, failure, sampledPeakBrowserRssBytes: peakRssBytes, samples,
  limitations: [
    'RSS sums Chromium processes, including renderer workers, GPU and utility processes; shared pages may be counted more than once.',
    'Polling may miss short peaks. This is sampled process RSS, not retained JS bytes or private physical memory.',
    'Sampling adds overhead. Use a separate run for latency comparisons.',
  ],
}, null, 2) + '\n')
if (!samples.length && !code) throw Error('No Chromium process samples were collected')
console.log(`Sampled peak browser RSS: ${(peakRssBytes / 1048576).toFixed(1)} MiB (${samples.length} samples)`)
process.exitCode = code
