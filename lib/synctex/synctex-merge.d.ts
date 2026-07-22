import { SynctexData } from './synctex-parser';
/**
 * Merge a tail's SyncTeX (from `compileFromCheckpoint`) onto the head pages of the last full
 * compile's SyncTeX, producing a complete SyncTeX for the spliced head+tail PDF (#99 Phase 2).
 * This lets an incremental fast paint carry EXACT SyncTeX so click-to-source works immediately
 * and the background full reconcile can be skipped for the servable (final) edit.
 *
 * The tail is compiled in isolation as a virtual file (`tailFile`, e.g. `tail.tex`) so its own
 * source lines are tail-relative and its pages start at 1. The merge:
 *   - keeps head pages `1..headPageCount` unchanged (their nodes already map to their real files);
 *   - offsets each tail page by `headPageCount`; rewrites `tailFile` nodes to the head's `mainFile`
 *     tag with their source lines offset by `tailLineOffset` (the head's line count); remaps each
 *     `\include`d chapter the tail loads to a fresh merged tag, keeping its real name and its
 *     file-relative lines — coordinates are per-page-relative, so they never move;
 *   - rebuilds `pageRoots`/`friendIndex` exactly as {@link SynctexParser} does.
 *
 * Multi-file aware: `\include`/`\input` chapters in the tail are handled per-file (their lines are
 * file-relative like in a full compile, only `tailFile`'s own lines are offset). Preconditions the
 * CALLER must guarantee: the head — the main-source prefix AND every file it bakes in — is unchanged
 * since the last full compile (so head pages `1..headPageCount` are still valid) and head/tail share
 * the preamble. Returns `null` (→ keep the last full SyncTeX and reconcile) when the expected
 * `mainFile`/`tailFile` input tags can't be found.
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
