/*
 * makeindex-entry.c — WASM entry point for makeindex (#101).
 *
 * Exports compileMakeindex() which calls makeindex's main() on the current
 * base name. The base name is set via setMainEntry() from the worker JS before
 * the call. makeindex reads <base>.idx (and an optional -s style .ist resolved
 * through the kpse hook) and writes <base>.ind + <base>.ilg in WORKROOT.
 *
 * Built separately from the TeX engines (own main(), own glue) like bibtex-entry.c.
 */

#include <stdio.h>
#include <string.h>

/* makeindex main() — texk/makeindexk/mkind.c */
extern int main(int argc, char **argv);

static char main_entry[1024] = "main";

/* Called from JS before compileMakeindex() to set the .idx basename. */
int setMainEntry(const char *entry) {
    if (!entry) return -1;
    strncpy(main_entry, entry, sizeof(main_entry) - 1);
    main_entry[sizeof(main_entry) - 1] = '\0';
    /* Strip a trailing .idx if the host passed the full input name. */
    size_t len = strlen(main_entry);
    if (len > 4 && strcmp(main_entry + len - 4, ".idx") == 0) {
        main_entry[len - 4] = '\0';
    }
    return 0;
}

/*
 * Run makeindex on <main_entry>.idx.
 * Expects <main_entry>.idx to exist in WORKROOT (/work/).
 * Produces <main_entry>.ind and <main_entry>.ilg. We name the output
 * explicitly (-o) so it is deterministic regardless of makeindex's
 * default-extension logic, and pass the .idx input explicitly.
 */
int compileMakeindex(void) {
    static char idx[1030];
    static char ind[1030];
    snprintf(idx, sizeof(idx), "%s.idx", main_entry);
    snprintf(ind, sizeof(ind), "%s.ind", main_entry);
    char *argv[] = {
        "makeindex",
        "-o", ind,
        idx,
        NULL
    };
    return main(4, argv);
}
