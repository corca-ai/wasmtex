import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { installNodeWorkerHost } from './node-host'
import { createEngineWorker, type EngineWorker } from './worker-host'

function response(worker: EngineWorker) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('XHR worker did not respond')), 10_000)
    worker.onmessage = ({ data }) => {
      clearTimeout(timer)
      resolve(data)
    }
    worker.onerror = (error) => {
      clearTimeout(timer)
      reject(error)
    }
  })
}

it('keeps simultaneous workers’ HTTP headers with their own response bodies', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wasmtex-xhr-overlap-'))
  const bin = join(directory, 'bin')
  const assets = join(directory, 'public')
  mkdirSync(bin)
  mkdirSync(assets)
  // A controlled curl process lets B finish while A is still receiving its body.
  // No network timing or knowledge of the host's temporary-file naming is needed.
  writeFileSync(
    join(bin, 'curl'),
    `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const dir = process.env.WASMTEX_XHR_TEST_DIR
const args = process.argv.slice(2)
const id = args.at(-1).split('/').pop()
const headers = args[args.indexOf('-D') + 1]
function wait(name) {
  const deadline = Date.now() + 10000
  while (!fs.existsSync(path.join(dir, name))) {
    if (Date.now() > deadline) throw Error('barrier timeout: ' + name)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
}
if (id === 'b') wait('a-headers-ready')
fs.writeFileSync(headers, 'HTTP/1.1 200 OK\\r\\nX-Request: ' + id + '\\r\\n\\r\\n')
if (id === 'a') {
  fs.writeFileSync(path.join(dir, 'a-headers-ready'), '')
  wait('release-a')
}
process.stdout.write('body-' + id)
`,
    { mode: 0o755 },
  )
  writeFileSync(join(assets, 'probe.wasm'), new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
  writeFileSync(
    join(assets, 'probe.worker.js'),
    `
self.onmessage = ({ data }) => {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', 'https://fixture.invalid/' + data, false)
  xhr.send()
  self.postMessage({ body: xhr.responseText, header: xhr.getResponseHeader('x-request') })
}
`,
  )
  vi.stubEnv('PATH', bin + delimiter + process.env.PATH)
  vi.stubEnv('WASMTEX_XHR_TEST_DIR', directory)
  const host = installNodeWorkerHost({ publicDir: assets, assetBaseUrl: 'http://assets.local/' })
  const workers: EngineWorker[] = []
  try {
    const a = createEngineWorker('http://assets.local/probe.worker.js')
    const b = createEngineWorker('http://assets.local/probe.worker.js')
    workers.push(a, b)
    const aResult = response(a)
    const bResult = response(b)
    a.postMessage('a')
    b.postMessage('b')
    expect(await bResult).toEqual({ body: 'body-b', header: 'b' })
    writeFileSync(join(directory, 'release-a'), '')
    expect(await aResult).toEqual({ body: 'body-a', header: 'a' })
  } finally {
    writeFileSync(join(directory, 'release-a'), '')
    for (const worker of workers) worker.terminate()
    host.dispose()
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
}, 15_000)
