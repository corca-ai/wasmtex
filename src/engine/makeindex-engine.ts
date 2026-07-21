import type { TexliveVersion } from '../types'
import { engineWorkerUrl } from './engine-assets'
import { WasmTexWorker } from './wasmtex-worker'

/**
 * The bundled from-source makeindex (#115), driving the WasmTex worker protocol. Turns a
 * `<base>.idx` (emitted by a LaTeX
 * pass when `\makeindex` is active) into `<base>.ind` so `\printindex` resolves, fully
 * client-side. Runs identically under the Node host (#121), same as the proven engines.
 */
export class MakeindexEngine extends WasmTexWorker {
  constructor(options?: {
    assetBaseUrl?: string
    texliveUrl?: string
    texliveVersion?: TexliveVersion
  }) {
    const base = options?.assetBaseUrl ?? import.meta.env.BASE_URL
    const version = options?.texliveVersion ?? '2025'
    super(engineWorkerUrl(base, version, 'makeindex'), options?.texliveUrl ?? null, version)
  }

  /** Process `<idxBaseName>.idx` → `<idxBaseName>.ind` (+ `.ilg` log). The worker reads the
   *  `.idx` from its MEMFS (write it first) and replies under the shared `cmd:compile` key. */
  async compile(idxBaseName: string): Promise<{ success: boolean; log: string }> {
    if (this.status !== 'ready' || !this.worker) {
      return { success: false, log: 'makeindex engine not ready' }
    }

    // makeindex's startup resolves its own program directory by `lstat`-ing argv[0]
    // ("makeindex") against the cwd; in the bare WASM filesystem that path doesn't exist,
    // so kpathsea FATALs ("Can't get directory of program name") and exits before writing
    // any output. A zero-byte stub named `makeindex` in the cwd makes that lstat succeed.
    await this.writeFile('makeindex', '')

    this.status = 'compiling'

    const data = await this.postMessageWithResponse(
      { cmd: 'compilemakeindex', url: idxBaseName },
      'cmd:compile',
    )

    this.status = 'ready'
    return {
      success: data.result === 'ok',
      log: data.log || '',
    }
  }
}
