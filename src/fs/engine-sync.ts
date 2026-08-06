import type { VirtualFile } from '../types'

/** Minimal file store the full sync needs (a subset of {@link VirtualFS}). */
export interface SyncFileStore {
  listFiles(): string[]
  getFile(path: string): VirtualFile | undefined
  markSynced(files: Iterable<VirtualFile>): void
}

/** Minimal engine sink the full sync writes through. */
export interface SyncEngineSink {
  writeFile(path: string, content: string | Uint8Array): Promise<void>
  setMainFile(mainFile: string): void
}

/**
 * Write every project file to the engine, then mark **only the files actually
 * written** as synced (by identity), and set the main file.
 *
 * A host edit that replaces a file's map entry during the awaits must stay
 * `modified` so the next cycle re-sends it — clearing every file's flag (a bare
 * `markSynced()`) would silently drop that edit. Shared by the UI (`WasmTex.init`)
 * and headless (`WasmTexCompiler`) full-sync paths so the two cannot drift.
 */
export async function syncAllFilesToEngine(
  fs: SyncFileStore,
  engine: SyncEngineSink,
  ensureDirectories: (paths: string[]) => Promise<void>,
  mainFile: string,
): Promise<void> {
  const paths = fs.listFiles()
  await ensureDirectories(paths)
  // Capture the exact VFS entries before dispatch. The worker processes writes on
  // one thread, but allowing their request/response round trips to overlap avoids
  // one main-thread scheduling turn per file. Identity-based markSynced below still
  // leaves any entry replaced by a concurrent host edit modified.
  const synced = paths.flatMap((path) => {
    const file = fs.getFile(path)
    return file ? [file] : []
  })
  await Promise.all(synced.map((file) => engine.writeFile(file.path, file.content)))
  fs.markSynced(synced)
  engine.setMainFile(mainFile)
}
