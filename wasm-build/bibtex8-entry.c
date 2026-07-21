/*
 * bibtex8-entry.c — WASM entry point for bibtex8 (8-bit BibTeX) (#102).
 *
 * Mirrors bibtex-entry.c but drives the texk/bibtex-x program (compiled with
 * -DSUPPORT_8BIT) for 8-bit encodings / larger capacity. Exports compileBibtex8();
 * the .aux basename is set via setMainEntry() from the worker before the call.
 */

#include <stdio.h>
#include <string.h>

/* bibtex8 main() — texk/bibtex-x/bibtex.c */
extern int main(int argc, char **argv);

static char main_entry[1024] = "main";

int setMainEntry(const char *entry) {
    if (!entry) return -1;
    strncpy(main_entry, entry, sizeof(main_entry) - 1);
    main_entry[sizeof(main_entry) - 1] = '\0';
    size_t len = strlen(main_entry);
    if (len > 4 && strcmp(main_entry + len - 4, ".aux") == 0) {
        main_entry[len - 4] = '\0';
    }
    return 0;
}

/*
 * Run bibtex8 on <main_entry>.aux. `-B` selects big capacity; the program reads
 * <base>.aux + the .bst style (resolved through the kpse hook) and writes
 * <base>.bbl + <base>.blg in WORKROOT.
 */
int compileBibtex8(void) {
    char *argv[] = {
        "bibtex8",
        "-B",
        main_entry,
        NULL
    };
    return main(3, argv);
}
