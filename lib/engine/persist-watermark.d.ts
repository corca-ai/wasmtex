/** Shared bookkeeping for "persist fetched TeX Live files to the durable cache at most once
 *  per change". Both the WasmTex pdfTeX engine and the tex-fmt engines drive their persist pass
 *  through {@link persistIfNeeded} so the watermark semantics can't drift between them. */
export interface PersistState {
    /** Monotonic count of files fetched from the network this session. */
    downloadCount: number;
    /** `downloadCount` at the last *confirmed* save (-1 = never persisted). */
    lastPersisted: number;
    /** A `save()` is currently running (single-flight guard). */
    inFlight: boolean;
}
/**
 * Persist via `save` only when new files were fetched since the last confirmed save, and
 * advance the watermark **only after** `save` resolves. A rejected save leaves the watermark
 * behind so a later call retries — un-saved files are never marked as already-persisted
 * (which would silently lose them on the next return visit). Best-effort: swallows errors.
 */
export declare function persistIfNeeded(state: PersistState, save: () => Promise<void>): Promise<void>;
