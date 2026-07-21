import type { VirtualFile } from '../types'
import {
  DEFAULT_ALGEBRA,
  DEFAULT_ANALYSIS,
  DEFAULT_LINALG,
  DEFAULT_REFS_BIB,
  DEFAULT_TEX,
} from './default-project'

interface VirtualFSOptions {
  /** If true, start with no files (skip default main.tex template). */
  empty?: boolean
}

export class VirtualFS {
  private files = new Map<string, VirtualFile>()
  private listeners: Array<() => void> = []

  constructor(options?: VirtualFSOptions) {
    if (!options?.empty) {
      this.writeFile('main.tex', DEFAULT_TEX)
      this.writeFile('algebra.tex', DEFAULT_ALGEBRA)
      this.writeFile('analysis.tex', DEFAULT_ANALYSIS)
      this.writeFile('linalg.tex', DEFAULT_LINALG)
      this.writeFile('refs.bib', DEFAULT_REFS_BIB)
    }
  }

  writeFile(path: string, content: string | Uint8Array): void {
    this.files.set(path, { path, content, modified: true })
    this.notify()
  }

  readFile(path: string): string | Uint8Array | null {
    return this.files.get(path)?.content ?? null
  }

  deleteFile(path: string): boolean {
    const deleted = this.files.delete(path)
    if (deleted) this.notify()
    return deleted
  }

  listFiles(): string[] {
    return Array.from(this.files.keys()).sort()
  }

  getFile(path: string): VirtualFile | undefined {
    return this.files.get(path)
  }

  /** Get files that have been modified since last sync */
  getModifiedFiles(): VirtualFile[] {
    return Array.from(this.files.values()).filter((f) => f.modified)
  }

  /**
   * Mark files as synced. When `files` is given, only those exact objects are
   * cleared (by identity) — this avoids clearing the `modified` flag of an edit
   * that arrived (replacing the map entry) after the caller captured the set it
   * actually synced. With no argument, every current file is marked synced.
   */
  markSynced(files?: Iterable<VirtualFile>): void {
    for (const file of files ?? this.files.values()) {
      file.modified = false
    }
  }

  /**
   * Mark every current file as modified so the next sync re-sends all of them.
   * Used after an engine cache flush (which wipes the engine's whole file set):
   * without this, files already marked synced would never be re-written and the
   * next compile would run against an empty engine filesystem.
   */
  markAllModified(): void {
    for (const file of this.files.values()) {
      file.modified = true
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      // Remove exactly ONE registration (this subscription's), not every reference-equal
      // copy — `filter(!==)` would drop a sibling that subscribed the same fn separately.
      const i = this.listeners.indexOf(listener)
      if (i !== -1) this.listeners.splice(i, 1)
    }
  }

  private notify(): void {
    // Snapshot so a subscribe during the cycle waits for the next cycle, and
    // re-check membership so an unsubscribe during the cycle takes effect
    // immediately (a just-removed listener is not called this cycle).
    for (const l of [...this.listeners]) {
      if (this.listeners.includes(l)) l()
    }
  }
}
