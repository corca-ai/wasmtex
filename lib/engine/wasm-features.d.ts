/**
 * Runtime WebAssembly capability detection.
 *
 * Used to decide which engine binary to serve. A SIMD build of pdfTeX (emscripten
 * `-msimd128`) must only be loaded where the host supports the v128 instruction
 * set; otherwise instantiation fails. {@link wasmSimdSupported} is the gate a
 * SIMD-enabled build would check before choosing the SIMD artifact, with a
 * scalar fallback otherwise. See `docs/engine.md` for the SIMD decision.
 */
/** Whether the runtime supports WebAssembly SIMD (v128). Never throws. */
export declare function wasmSimdSupported(): boolean;
