/**
 * Runtime WebAssembly capability detection.
 *
 * Used to decide which engine binary to serve. A SIMD build of pdfTeX (emscripten
 * `-msimd128`) must only be loaded where the host supports the v128 instruction
 * set; otherwise instantiation fails. {@link wasmSimdSupported} is the gate a
 * SIMD-enabled build would check before choosing the SIMD artifact, with a
 * scalar fallback otherwise. See `docs/engine.md` for the SIMD decision.
 */

// A minimal valid module whose single function returns a `v128`
// (`i8x16.splat (i32.const 0)`). Validating it is the standard, cheap way to
// detect SIMD support.
const SIMD_DETECT_MODULE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 8, 1, 6, 0, 65, 0, 253, 15,
  11,
])

/** Whether the runtime supports WebAssembly SIMD (v128). Never throws. */
export function wasmSimdSupported(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_DETECT_MODULE)
  } catch {
    return false
  }
}
