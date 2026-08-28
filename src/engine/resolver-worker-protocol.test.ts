import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('resolver worker protocol', () => {
  it('packages one independently owned helper beside each engine family', () => {
    const controllers = [
      ['pdftex-worker.js', 'wasmtex-pdftex-resolver-evidence.js'],
      ['xetex-worker.js', 'wasmtex-xetex-resolver-evidence.js'],
      ['dvipdfm-worker.js', 'wasmtex-xetex-resolver-evidence.js'],
      ['luatex-worker.js', 'wasmtex-luatex-resolver-evidence.js'],
    ] as const

    for (const [controller, helper] of controllers) {
      const source = readFileSync(resolve('wasm-build', controller), 'utf8')
      expect(source).toContain(`importScripts('${helper}')`)
    }
  })

  it('emits a bounded data-only message without remote side effects', () => {
    const source = readFileSync(resolve('wasm-build/resolver-evidence.js'), 'utf8')
    const postMessage = vi.fn()
    const scope = { postMessage }
    new Function('self', source)(scope)
    const evidence = (
      scope as typeof scope & {
        wasmtexResolverEvidence: (
          name: string,
          format: number,
          outcome: string,
          attempts: unknown[],
        ) => void
      }
    ).wasmtexResolverEvidence

    evidence(
      'missing.sty',
      26,
      'mirror-absent',
      Array.from({ length: 20 }, () => ({ source: 'network', outcome: 'not-found' })),
    )

    expect(postMessage).toHaveBeenNthCalledWith(1, { cmd: 'resolverready', schemaVersion: 1 })
    expect(postMessage.mock.calls[1]![0]).toEqual({
      cmd: 'resolver',
      evidence: {
        requestedName: 'missing.sty',
        format: 26,
        outcome: 'mirror-absent',
        attempts: Array.from({ length: 8 }, () => ({
          source: 'network',
          outcome: 'not-found',
        })),
      },
    })
  })
})
