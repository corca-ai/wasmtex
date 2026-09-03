/**
 * Which bloom filter object a mirror snapshot serves.
 *
 * `bloom-filter.v2.bin` is built at a 1e-4 false-positive rate (about 19 bits per
 * key); the original `bloom-filter.bin` at 1e-2. A false positive is not free: the
 * worker then asks the mirror for a name that is not there, and every document
 * that uses the same package pays that round trip on every cold compile. Snapshots
 * published before v2 existed only carry the original, so the engine tries v2 and
 * falls back. Both share the `BF01` binary format the worker parses.
 */
export declare const BLOOM_FILTER_OBJECTS: readonly ["bloom-filter.v2.bin", "bloom-filter.bin"];
/** Fetch the tightest bloom filter the mirror offers, or null when none loads. */
export declare function fetchBloomFilter(baseUrl: string, init?: RequestInit, fetchImpl?: typeof fetch): Promise<ArrayBuffer | null>;
