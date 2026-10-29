import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

function resolver() {
  const files = new Map<string, Uint8Array>()
  const requests: string[] = []
  const messages: unknown[] = []
  const scope = createContext({
    importScripts() {},
    postMessage: (message: unknown) => messages.push(message),
    UTF8ToString: (value: string) => value,
    FS: { writeFile: (path: string, data: Uint8Array) => files.set(path, data) },
    XMLHttpRequest: class {
      status = 200
      response = Uint8Array.of(9).buffer
      open(_method: string, url: string) {
        requests.push(url)
      }
      send() {}
      getResponseHeader() {
        return null
      }
    },
  })
  scope.self = scope
  for (const name of ['kpse-resolve.cjs', 'resolver-evidence.js', 'pdftex-worker.js']) {
    runInContext(readFileSync(new URL(`../../wasm-build/${name}`, import.meta.url), 'utf8'), scope)
  }
  scope.allocateString = (value: string) => value
  scope.payload = {
    cmd: 'preloadtransport',
    msgId: 'prefetch',
    files: [{ format: 3, filename: 'font.tfm', data: Uint8Array.of(1, 2).buffer, fileId: null }],
  }
  runInContext('self.onmessage({data: payload})', scope)
  return {
    scope,
    files,
    requests,
    messages,
    lookup(name: string) {
      scope.requestName = name
      return runInContext('kpse_find_file_impl(requestName, 3, true)', scope)
    },
  }
}

describe('pdfTeX transport-only prefetch', () => {
  it('creates no TeX files until the normal resolver demands the exact candidate', () => {
    const host = resolver()
    expect(host.files.size).toBe(0)
    expect(host.messages).toContainEqual({
      result: 'ok',
      cmd: 'preloadtransport',
      msgId: 'prefetch',
    })
    expect(host.lookup('font.tfm')).toBe('/tex/font.tfm')
    expect([...host.files.get('/tex/font.tfm')!]).toEqual([1, 2])
    expect(host.requests).toEqual([])
    expect(host.lookup('font.tfm')).toBe('/tex/font.tfm')
    expect(host.requests).toEqual([])
  })

  it('does not let a prefetched extension displace a preferred bare-name response', () => {
    const host = resolver()
    expect(host.lookup('font')).toBe('/tex/font.tfm')
    expect(host.requests).toEqual(['pdftex/3/font'])
    expect([...host.files.get('/tex/font.tfm')!]).toEqual([9])
    // Preserve the baseline alias transition on a later, distinct request too.
    host.lookup('font.tfm')
    expect([...host.files.get('/tex/font.tfm')!]).toEqual([1, 2])
  })

  it('never preloads project paths', () => {
    const host = resolver()
    expect(host.lookup('/tex/font.tfm')).toBe(0)
    expect(host.files.size).toBe(0)
    expect(host.requests).toEqual([])
  })
})
