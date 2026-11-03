import { vi } from 'vitest'
import type { CompileResult } from '../types'

/** A successful compile result; `resumed` marks a heap-checkpoint resume. */
export function checkpointResult(
  resumed = false,
  extra: Partial<CompileResult> = {},
): CompileResult {
  return {
    success: true,
    synctex: null,
    pdf: new Uint8Array([resumed ? 1 : 2]),
    log: '',
    errors: [],
    compileTime: 1,
    ...(resumed
      ? {
          phaseTimings: {
            workerTotalMs: 1,
            heapRestoreMs: 0,
            heapSnapshotMs: 0,
            heapSnapshotBytes: 0,
            heapSizeBytes: 0,
            preambleBuildMs: 0,
            formatInstallMs: 0,
            preambleExportMs: 0,
            postProcessMs: 0,
            texRunMs: 1,
            checkpointResume: true,
          },
        }
      : {}),
    ...extra,
  }
}

/** A heap-checkpoint engine whose full compiles and resumes return the given results. */
export function checkpointEngine(
  full: () => CompileResult = () => checkpointResult(),
  resume: () => CompileResult = () => checkpointResult(true),
) {
  return {
    supportsHeapCheckpoints: true,
    init: async () => {},
    mkdir: async () => {},
    writeFile: async () => {},
    setMainFile: () => {},
    readFile: async () => null,
    flushCache: async () => {},
    clearCache: async () => {},
    terminate: vi.fn(),
    getStatus: () => 'ready' as const,
    compile: vi.fn(async () => full()),
    compileFromHeapCheckpoint: vi.fn(async () => resume()),
    dropHeapCheckpoints: async () => {},
  }
}
