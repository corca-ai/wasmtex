/* =============================================================================
 * xetex-entry.c — WASM entry points for the WasmTex worker protocol (XeTeX)  [#52]
 * =============================================================================
 *
 * Mirrors luatex-entry.c / wasm-entry.c: wraps texlive-source xetex's standard
 * main() with a constructed argv so the authored xetex-worker.js controller can
 * drive it via cwrap. Keeps upstream texmfmp.c unpatched (interpose, don't patch).
 *
 * XeTeX emits XDV (`-no-pdf`); the second dvipdfmx stage makes the PDF. The format
 * is dumped by `xetex -ini *xelatex.ini` (jobname xelatex -> xelatex.fmt), then the
 * glue re-injects those bytes as `wasmtex-xetex.fmt`; compileLaTeX loads it with
 * `--fmt=wasmtex-xetex` (the file's name need not match its dump jobname). This
 * mirrors luatex-entry.c (lualatex.ini dump -> --fmt=wasmtex-luatex load).
 * restoreHeapMemory() in the glue resets globals between calls so main() is
 * re-callable.
 *
 * argv[0] is the ABSOLUTE dummy path /work/xetex the glue creates, so kpathsea can
 * derive SELFAUTODIR=/work and find /work/texmf.cnf (no /proc/self/exe under WASM).
 * ========================================================================== */
#include <string.h>

#define PROG "/work/xetex"

static char main_entry[1024] = "main.tex";
extern int main(int argc, char **argv); /* texlive-source xetex web2c main */

int setMainEntry(const char *entry) {
  strncpy(main_entry, entry, sizeof(main_entry) - 1);
  main_entry[sizeof(main_entry) - 1] = '\0';
  return 0;
}

int compileLaTeX(void) {
  char *argv[] = {PROG, "-no-pdf", "-interaction=nonstopmode", "-recorder",
                  "--fmt=wasmtex-xetex", main_entry, NULL};
  return main(6, argv);
}

int compileFormat(void) {
  /* The leading '*' on the bootstrap input enables e-TeX EXTENDED mode at -ini time
   * (web2c convention; fmtutil uses `*xelatex.ini`). Without it the dump lacks e-TeX
   * and latex.ltx aborts with "LaTeX requires e-TeX". */
  char *argv[] = {PROG, "-ini", "-interaction=nonstopmode", "*xelatex.ini", NULL};
  return main(4, argv);
}

/* XeTeX (built --disable-bibtex) has no bibtex pass; the worker calls this after
 * compileLaTeX, so provide a no-op success. (BibTeX runs as its own engine.) */
int compileBibtex(void) { return 0; }
