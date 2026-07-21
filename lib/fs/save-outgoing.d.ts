import { VirtualFS } from './virtual-fs';
/**
 * Persist the outgoing editor buffer back to the VFS when switching away from a file —
 * but ONLY if that file still exists. Saving a path that was deleted out from under the
 * editor (e.g. deleting the currently-open file, which then opens mainFile while
 * `currentFile` is still the deleted path) would RESURRECT it in the VFS with the editor's
 * stale content, so the deletion silently would not take effect. Returns whether a write
 * happened, so the caller can also skip the project-index update for a vanished file.
 */
export declare function saveOutgoingFile(fs: VirtualFS, path: string, value: string): boolean;
