/* =============================================================================
 * luatex-entry.c — WASM entry points for the WasmTex worker protocol (LuaHBTeX)
 * =============================================================================
 *
 * Mirrors wasm-entry.c (pdfTeX): wraps luatex's main() with a constructed argv so
 * the worker controller can drive it. The authored luatex-worker.js calls
 * these via cwrap/ccall; restoreHeapMemory() resets global state between calls so
 * main() is safely re-callable.
 *
 * argv[0] is an ABSOLUTE path (/work/luahbtex) that the glue creates as a dummy
 * file: kpathsea derives the program directory from argv[0] (there is no
 * /proc/self/exe and PATH is empty under WASM), so an absolute, existing path lets
 * it resolve SELFAUTODIR=/work and find /work/texmf.cnf.
 * ========================================================================== */
#include <string.h>

#define PROG "/work/luahbtex"

static char main_entry[1024] = "main.tex";
extern int main(int argc, char **argv); /* luahbtex web2c main (luatex.c) */

int setMainEntry(const char *entry) {
    strncpy(main_entry, entry, sizeof(main_entry) - 1);
    main_entry[sizeof(main_entry) - 1] = '\0';
    return 0;
}

int compileLaTeX(void) {
    char *argv[] = {
        PROG,
        "-interaction=nonstopmode",
        "--fmt=wasmtex-luatex",
        main_entry,
        NULL
    };
    return main(4, argv);
}

int compileFormat(void) {
    char *argv[] = {
        PROG,
        "-ini",
        "-interaction=nonstopmode",
        "lualatex.ini",
        NULL
    };
    return main(4, argv);
}
