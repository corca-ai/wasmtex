/**
 * Install/uninstall of WasmTex's cross-file go-to-definition fallback on Monaco's private
 * `_codeEditorService.openCodeEditor`. Extracted from {@link WasmTex} so the install +
 * RESTORE lifecycle is unit-testable without a DOM editor.
 *
 * WasmTex monkeypatches `openCodeEditor` so a ctrl-click on a `\ref`/`\input` resolves
 * against its own in-memory models. For an EXTERNAL (host-owned) editor, the editor outlives
 * the WasmTex instance, so {@link OverrideHandle.dispose} MUST put the original back —
 * otherwise the host keeps invoking a closure that captures a torn-down instance (its models
 * map is cleared, so cross-file navigation silently fails) and the disposed instance can
 * never be garbage-collected.
 */

type OpenCodeEditorFn = (
  input: unknown,
  source: unknown,
  sideBySide: unknown,
) => Promise<unknown> | unknown

/** Minimal surface of Monaco's `_codeEditorService` that the override swaps. Declared as a
 *  METHOD so a caller's more-specifically-typed `openCodeEditor(input: SomeInput, ...)` stays
 *  assignable (method params are bivariant). */
export interface OpenCodeEditorService {
  openCodeEditor(input: unknown, source: unknown, sideBySide: unknown): Promise<unknown> | unknown
}

export interface OverrideHandle {
  /** Restore the service's original `openCodeEditor`. Idempotent, and a no-op if a later
   *  consumer has since replaced our patch (so we never clobber someone else's override). */
  dispose(): void
}

/**
 * Replace `service.openCodeEditor` with a wrapper that calls `handler`, passing through the
 * bound original so the handler can fall back to default Monaco behavior. Returns a handle
 * whose `dispose()` restores the original.
 */
export function installOpenCodeEditorOverride(
  service: OpenCodeEditorService,
  handler: (
    input: unknown,
    source: unknown,
    sideBySide: unknown,
    original: OpenCodeEditorFn,
  ) => Promise<unknown> | unknown,
): OverrideHandle {
  // Keep the original's exact reference so dispose() restores the service byte-for-byte
  // (no leftover bound wrapper). The handler gets a separately-bound copy for its fallback.
  const original = service.openCodeEditor
  const boundOriginal: OpenCodeEditorFn = (input, source, sideBySide) =>
    original.call(service, input, source, sideBySide)
  const patched: OpenCodeEditorFn = (input, source, sideBySide) =>
    handler(input, source, sideBySide, boundOriginal)
  service.openCodeEditor = patched
  return {
    dispose() {
      if (service.openCodeEditor === patched) service.openCodeEditor = original
    },
  }
}
