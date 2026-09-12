import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nestedOutputSequence } from '../../test/fixtures/nested-output'
import { installNodeWorkerHost } from './node-host'
import { smokeTexliveProfile } from './smoke-texlive-profile'

describe.runIf(process.env.NESTED_OUTPUT_SMOKE === '1')(
  'nested output on real workers (#135)',
  () => {
    for (const engine of ['xelatex', 'pdflatex', 'lualatex'] as const) {
      it(`${engine}: nested/root switches and repeated output`, async () => {
        const host = installNodeWorkerHost({
          publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? resolve('public'),
          assetBaseUrl: 'http://assets.local/',
        })
        const profile = smokeTexliveProfile()
        try {
          const reports = await nestedOutputSequence({
            engine,
            texliveVersion: profile.version,
            texliveUrl: profile.url,
            assetBaseUrl: 'http://assets.local/',
          })
          expect(reports).toHaveLength(engine === 'xelatex' ? 11 : 10)
        } finally {
          host.dispose()
        }
      }, 300_000)
    }
  },
)
