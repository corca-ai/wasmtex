/** Lightweight pipeline timing collector.
 *
 * Records named spans (mark → end) and exposes the last timing per span.
 * In debug mode (?perf=1) an overlay shows live timings.
 */
interface SpanTiming {
    name: string;
    ms: number;
}
type SpanListener = (span: SpanTiming) => void;
export declare class PerfMetrics {
    private marks;
    private timings;
    private listeners;
    /** Start a named span. */
    mark(name: string): void;
    /** End a named span and record its duration. Returns ms elapsed. */
    end(name: string): number;
    /** Get last recorded duration for a span. */
    get(name: string): number | undefined;
    /** Get all recorded timings. */
    all(): Map<string, number>;
    /** Subscribe to span completions. Returns an unsubscribe function (like
     *  {@link VirtualFS.onChange}) so a re-initialized overlay or embed doesn't leak a
     *  growing list of stale listeners. */
    onSpan(fn: SpanListener): () => void;
}
/** Singleton metrics instance. */
export declare const perf: PerfMetrics;
/** Attach a debug overlay if ?perf=1 is in the URL. Returns a disposer that removes the
 *  overlay and unsubscribes its listener (call it from the owner's teardown), or undefined
 *  when no overlay was attached. */
export declare function initPerfOverlay(): (() => void) | undefined;
export {};
