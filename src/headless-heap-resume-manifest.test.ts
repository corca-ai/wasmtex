import { afterEach, expect, it, vi } from 'vitest'
import { checkpointEngine, checkpointResult } from './__tests__/heap-checkpoint-engine'
import * as factory from './engine/compile-engine'
import { HeapCheckpointCompiler } from './engine/heap-checkpoints'
import { WasmTexCompiler } from './headless'

const main = String.raw`\documentclass{book}
\begin{document}
\include{ch1}
\include{ch2}
\end{document}`
const files = { 'main.tex': main, 'ch1.tex': 'First\nchapter.', 'ch2.tex': 'Second chapter.' }
const everyInput = ['/work/main.tex', '/work/ch1.tex', '/work/ch2.tex']
const result = (inputFiles: string[], resumed = false) =>
  checkpointResult(resumed, { inputFiles, inputFilesComplete: true })
afterEach(() => vi.restoreAllMocks())

/** A full compile, then an edit to ch1.tex resumed from a checkpoint before it. */
async function resumeAfterFullCompile(resumedInputs: string[], resumeRecorder: boolean) {
  const engine = {
    ...checkpointEngine(
      () => result(everyInput),
      () => result(resumedInputs, true),
    ),
    supportsResumeRecorder: resumeRecorder,
  }
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({ files })
  await compiler.init()
  const full = await compiler.compile()
  const heap = new HeapCheckpointCompiler(engine, { minHeadBytes: 0 })
  heap.noteFull(main, new Map(Object.entries(files)), {
    ...result(everyInput),
    heapCheckpoints: [
      {
        id: 'before-ch1',
        line: 3,
        bytes: 1024,
        ms: 1,
        inputs: ['/work/main.tex'],
        inputsComplete: true,
      },
    ],
  })
  ;(compiler as unknown as { heap: HeapCheckpointCompiler }).heap = heap
  compiler.setFile('ch1.tex', 'First\nchapter, edited.')
  try {
    const resumed = await compiler.compile()
    expect(engine.compileFromHeapCheckpoint).toHaveBeenCalledTimes(1)
    expect(resumed.phaseTimings?.checkpointResume).toBe(true)
    return {
      full: full.telemetry?.dependencyManifest,
      resumed: resumed.telemetry?.dependencyManifest,
    }
  } finally {
    compiler.dispose()
  }
}

it('never reports an older worker resume recorder as a complete dependency manifest', async () => {
  // Older workers lose the reads after the restored heap: the resumed tail read
  // ch1.tex and ch2.tex, yet only the head's files remain in its recorder.
  const manifests = await resumeAfterFullCompile(['/work/main.tex'], false)
  expect(manifests.full?.complete).toBe(true)
  // A complete manifest without ch2.tex would let a host reuse this PDF for
  // the next edit to ch2.tex and never compile it.
  expect(manifests.resumed?.complete).toBe(false)
  expect(manifests.resumed?.incompleteReason).toBe('recorder-unavailable')
})

it('keeps the complete manifest of a worker that records resumed reads', async () => {
  const manifests = await resumeAfterFullCompile(everyInput, true)
  expect(manifests.resumed?.complete).toBe(true)
  expect(manifests.resumed?.projectInputs).toEqual(['ch1.tex', 'ch2.tex', 'main.tex'])
})
