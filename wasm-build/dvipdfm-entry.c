/* =============================================================================
 * dvipdfm-entry.c — WASM entry points for the dvipdfmx engine (from texlive-source) [#52]
 * =============================================================================
 *
 * Mirrors xetex-entry.c: wraps texlive-source dvipdfmx's standard main() with a
 * constructed argv so the authored dvipdfm-worker.js controller can drive it via
 * cwrap. The texlive-source dpx uses the plain main() + real libkpathsea, so the
 * entry is a simple argv shim like XeTeX's.
 *
 *   compilePDF :  main.xdv  ->  main.pdf   (`dvipdfmx -f pdftex.map -o main.pdf main.xdv`)
 *
 * argv[0] is the ABSOLUTE dummy path /work/dvipdfmx the glue creates, so kpathsea can
 * derive SELFAUTODIR=/work (no /proc/self/exe under WASM). dvipdfmx ends by calling
 * exit(); the glue's runEngine() catches the emscripten ExitStatus.
 *
 * `-f pdftex.map`: TeX Live's dvipdfmx normally learns its font map(s) from
 * dvipdfmx.cfg (`f dvipdfmx.map`), but that cfg isn't on the WasmTex CDN, so
 * read_config_file() finds nothing and traditional (TFM/Type1) fonts like cmmi10
 * have no physical-font mapping ("Cannot proceed without .vf or physical font").
 * We load pdftex.map explicitly — the combined updmap map maps cmmi10 ->
 * cmmi10.pfb etc. (the kpse hook fetches it from
 * the CDN). Native OpenType fonts are embedded directly and don't need the map.
 * ========================================================================== */
#include <string.h>

/* The program is `xdvipdfmx`; it selects XDV (XeTeX extended DVI) mode from argv[0].
 * Invoking it as plain "dvipdfmx" leaves it in DVI mode, which can't parse XeLaTeX's
 * .xdv (it then blocks). Use the xdvipdfmx name so XDV input is handled. */
#define PROG "/work/xdvipdfmx"
#define FONTMAP "pdftex.map"

static char main_entry[1024] = "main.xdv";
extern int main(int argc, char **argv); /* texlive-source dvipdfmx main (dvipdfmx.c) */

int setMainEntry(const char *entry) {
  strncpy(main_entry, entry, sizeof(main_entry) - 1);
  main_entry[sizeof(main_entry) - 1] = '\0';
  return 0;
}

int compilePDF(void) {
  /* Derive the output name: <base>.xdv -> <base>.pdf (strip any final extension). */
  static char out[1024];
  strncpy(out, main_entry, sizeof(out) - 5);
  out[sizeof(out) - 5] = '\0';
  char *dot = strrchr(out, '.');
  if (dot && !strchr(dot, '/'))
    strcpy(dot, ".pdf");
  else
    strcat(out, ".pdf");
  char *argv[] = {PROG, "-f", FONTMAP, "-o", out, main_entry, NULL};
  return main(6, argv);
}
