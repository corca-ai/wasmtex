import { SynctexData } from './synctex-parser';
/**
 * Merge a tail's SyncTeX (from `compileFromCheckpoint`) onto the head pages of the last full
 * compile's SyncTeX, producing a complete SyncTeX for the spliced head+tail PDF (#99 Phase 2).
 * This lets an incremental fast paint carry EXACT SyncTeX so click-to-source works immediately
 * and the background full reconcile can be skipped for the servable (final) edit.
 *
 * The tail is compiled in isolation as a virtual file (`tailFile`, e.g. `tail.tex`) so its
 * source lines are tail-relative and its pages start at 1. The merge:
 *   - keeps head pages `1..headPageCount` unchanged (their nodes already map to `mainFile`);
 *   - offsets each tail page by `headPageCount`, its `tailFile` nodes' source lines by
 *     `tailLineOffset` (the head's line count), and rewrites their input tag to the head's
 *     `mainFile` tag — coordinates are per-page-relative, so they need no adjustment;
 *   - rebuilds `pageRoots`/`friendIndex` exactly as {@link SynctexParser} does.
 *
 * Preconditions the CALLER must guarantee: the head is unchanged since the last full compile
 * (so head pages `1..headPageCount` are still valid) and head/tail share the preamble (so the
 * `magnification`/`unit`/offset scalars match). Returns `null` — meaning "keep the last full
 * SyncTeX and reconcile with a full compile" — when the tail isn't a single-file tail (its only
 * non-`.aux` source file is `tailFile`) or the expected input tags can't be found.
 */
export interface TailMergeInput {
    head: SynctexData;
    tail: SynctexData;
    headPageCount: number;
    tailLineOffset: number;
    mainFile: string;
    tailFile: string;
}
export declare function mergeTailSynctex(input: TailMergeInput): SynctexData | null;
