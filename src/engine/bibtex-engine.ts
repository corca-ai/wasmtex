import type { TexliveVersion } from '../types'
import { engineWorkerUrl } from './engine-assets'
import { WasmTexWorker } from './wasmtex-worker'

export class BibtexEngine extends WasmTexWorker {
  constructor(options?: {
    assetBaseUrl?: string
    texliveUrl?: string
    texliveVersion?: TexliveVersion
  }) {
    const base = options?.assetBaseUrl ?? import.meta.env.BASE_URL
    const version = options?.texliveVersion ?? '2025'
    super(engineWorkerUrl(base, version, 'bibtex'), options?.texliveUrl ?? null, version)
  }

  async compile(auxBaseName: string): Promise<{ success: boolean; log: string }> {
    if (this.status !== 'ready' || !this.worker) {
      return { success: false, log: 'BibTeX engine not ready' }
    }
    this.status = 'compiling'

    const data = await this.postMessageWithResponse(
      { cmd: 'compilebibtex', url: auxBaseName },
      'cmd:compile',
    )

    this.status = 'ready'
    return {
      success: data.result === 'ok',
      log: data.log || '',
    }
  }
}
