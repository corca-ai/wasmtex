#!/usr/bin/env node
/**
 * Make a bitmap font and metrics with a built wasmtex-metafont.js, as a worker would: the
 * script runs in a scope with a synchronous XMLHttpRequest over the given mirror.
 *
 * Usage: node scripts/smoke-metafont.mjs <wasmtex-metafont.js> <mirror url or directory>
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

export function metafontWorkerScope(scriptPath, mirror) {
  class MirrorRequest {
    open(_method, url) {
      this.url = url
    }

    send() {
      try {
        this.response = /^https?:/.test(this.url)
          ? execFileSync('curl', ['-fsSL', this.url], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })
          : readFileSync(decodeURIComponent(this.url))
        this.status = 200
      } catch {
        this.status = 404
      }
    }
  }
  const scope = {
    XMLHttpRequest: MirrorRequest, TextEncoder, TextDecoder, WebAssembly, console, performance, atob,
    importScripts() {},
    location: { href: 'file:///wasmtex-metafont.js' },
  }
  scope.self = scope
  scope.texlive_endpoint = mirror.endsWith('/') ? mirror : `${mirror}/`
  vm.runInNewContext(readFileSync(scriptPath, 'utf8'), scope)
  return scope
}

export function temporaryHost() {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-metafont-'))
  const workRoot = join(root, 'work')
  const cacheRoot = join(root, 'tex')
  for (const directory of [workRoot, cacheRoot]) mkdirSync(directory)
  const fs = {
    analyzePath: (path) => ({ exists: existsSync(path) }),
    readFile: (path) => readFileSync(path),
    writeFile: (path, bytes) => writeFileSync(path, bytes),
    readdir: (path) => readdirSync(path),
    mkdir: (path) => mkdirSync(path),
  }
  return { fs, workRoot, cacheRoot }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [script, mirror] = process.argv.slice(2)
  if (!script || !mirror) {
    console.error('usage: smoke-metafont.mjs <wasmtex-metafont.js> <mirror url or directory>')
    process.exit(1)
  }
  const { wasmtexMetafont } = metafontWorkerScope(script, mirror)
  const host = temporaryHost()
  const pk = wasmtexMetafont.makePk('cmr10', 720, host)
  const tfm = wasmtexMetafont.makeTfm('cmr13', host)
  if (!pk || !tfm) {
    console.error(`no font: pk=${pk} tfm=${tfm}`)
    process.exit(1)
  }
  console.log(`cmr10.720pk ${readFileSync(pk).length} bytes, cmr13.tfm ${readFileSync(tfm).length} bytes`)
}
