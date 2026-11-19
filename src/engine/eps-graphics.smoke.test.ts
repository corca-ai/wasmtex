import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyEpsGraphics } from '../../test/fixtures/eps-graphics'
import { installNodeWorkerHost } from './node-host'
import { smokeTexliveProfile } from './smoke-texlive-profile'

describe.runIf(process.env.EPS_GRAPHICS_SMOKE === '1')('EPS graphics on released workers', () => {
  for (const engine of ['pdflatex', 'lualatex', 'xelatex'] as const) {
    it(`${engine} includes only the requested, current conversion`, async () => {
      const host = installNodeWorkerHost({
        publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? resolve('public'),
        assetBaseUrl: 'http://assets.local/',
      })
      const profile = smokeTexliveProfile()
      try {
        const report = await verifyEpsGraphics({
          engine,
          texliveVersion: profile.version,
          texliveUrl: profile.url,
          assetBaseUrl: 'http://assets.local/',
        })
        expect(report.calls).toBe(2)
      } finally {
        host.dispose()
      }
    }, 300_000)
  }
})
