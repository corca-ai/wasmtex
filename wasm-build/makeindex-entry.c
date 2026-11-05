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

/* A job names its own files, for nomencl, glossaries and every index past the first. */
static char job_input[1024];
static char job_output[1024];
static char job_style[1024];
static char job_log[1024];
static int job_letter_order;

int setMakeindexJob(const char *input, const char *output, const char *style, const char *log,
                    int letter_order) {
    snprintf(job_input, sizeof(job_input), "%s", input ? input : "");
    snprintf(job_output, sizeof(job_output), "%s", output ? output : "");
    snprintf(job_style, sizeof(job_style), "%s", style ? style : "");
    snprintf(job_log, sizeof(job_log), "%s", log ? log : "");
    job_letter_order = letter_order;
    return 0;
}

static int compileJob(void) {
    char *argv[10];
    int argc = 0;
    argv[argc++] = "makeindex";
    if (job_letter_order) argv[argc++] = "-l";
    if (job_style[0]) {
        argv[argc++] = "-s";
        argv[argc++] = job_style;
    }
    if (job_log[0]) {
        argv[argc++] = "-t";
        argv[argc++] = job_log;
    }
    argv[argc++] = "-o";
    argv[argc++] = job_output;
    argv[argc++] = job_input;
    argv[argc] = NULL;
    return main(argc, argv);
}

/*
 * Run makeindex on <main_entry>.idx.
 * Expects <main_entry>.idx to exist in WORKROOT (/work/).
 * Produces <main_entry>.ind and <main_entry>.ilg. We name the output
 * explicitly (-o) so it is deterministic regardless of makeindex's
 * default-extension logic, and pass the .idx input explicitly.
 */
int compileMakeindex(void) {
    if (job_input[0]) return compileJob();
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
