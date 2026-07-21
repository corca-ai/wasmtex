class i {
  constructor(e) {
    this.element = e;
  }
  /** The overlay is currently covering the editor. */
  isVisible() {
    return this.element.style.display !== "none";
  }
  /** Show the overlay (covering the editor with the binary preview). */
  show() {
    this.element.style.display = "flex";
  }
  /** Hide the overlay and drop its content, revealing the editor underneath. */
  hide() {
    this.element.style.display = "none", this.element.innerHTML = "";
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
  shouldSuppressModelChange(e, s) {
    return this.isVisible() && e === s;
  }
}
export {
  i as BinaryPreviewController
};
