/**
 * Binary-file preview overlay state, extracted from {@link WasmTex} so its visibility and
 * model-change-suppression logic is unit-testable without constructing a full DOM Monaco
 * editor (`wasmtex.ts` can't be imported in the node test env). The overlay's DOM content
 * (the `<img>` / info `<div>`) is still built by the caller against the same element; this
 * controller only toggles visibility, clears content, and answers the suppression question.
 */

/** Minimal surface of the overlay element the controller toggles (an `HTMLDivElement` in the
 *  app, a stub in tests). */
export interface PreviewOverlayElement {
  style: { display: string }
  innerHTML: string
}

export class BinaryPreviewController {
  constructor(private readonly element: PreviewOverlayElement) {}

  /** The overlay is currently covering the editor. */
  isVisible(): boolean {
    return this.element.style.display !== 'none'
  }

  /** Show the overlay (covering the editor with the binary preview). */
  show(): void {
    this.element.style.display = 'flex'
  }

  /** Hide the overlay and drop its content, revealing the editor underneath. */
  hide(): void {
    this.element.style.display = 'none'
    this.element.innerHTML = ''
  }

  /**
   * Whether an editor model-change for `path` should be ignored. While the overlay is up for
   * the file the user is on, the Monaco model is not what's displayed, so its change events
   * are stale view-wise and must not drive diagnostics/compiles.
   *
   * The bug this exists to prevent: any flow that switches the editor to a text file (opening
   * a file, loading a new project) MUST hide the overlay first — otherwise this keeps
   * returning `true` and silently drops every edit to the newly-shown file.
   */
  shouldSuppressModelChange(path: string, currentFile: string): boolean {
    return this.isVisible() && path === currentFile
  }
}
