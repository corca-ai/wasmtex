/**
 * Wrap raw file bytes in a Blob for preview/download.
 *
 * Use `data.slice()`, not `data.buffer`: `.buffer` is the whole backing
 * `ArrayBuffer`, so for a subarray-backed view (`new Uint8Array(buf, off, len)`)
 * it would include extra bytes and yield a corrupt/oversized blob. `slice()` copies
 * exactly the view's `byteOffset`/`byteLength` into a fresh `ArrayBuffer`.
 */
export declare function binaryFileBlob(data: Uint8Array): Blob;
