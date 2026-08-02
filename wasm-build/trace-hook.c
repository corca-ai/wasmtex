/* =============================================================================
 * trace-hook.c — Scan pdfTeX hash table post-compilation for LSP completions
 * =============================================================================
 *
 * After pdfTeX compiles a document, the WASM heap retains the full hash table
 * of ALL defined control sequences — base LaTeX, loaded packages, and user
 * definitions. This function scans the hash table and writes command names
 * to a MEMFS file that the worker JS reads and sends to the host.
 *
 * The scan is a read-only operation on the post-compilation WASM heap state.
 * It runs BEFORE restoreHeapMemory() is called for the next compilation.
 *
 * Hash table structure (from pdftexd.h, web2c generated):
 *   hash[514..hashtop]  — twohalves entries
 *   hash[p].v.RH        — string number of the CS name (0 = empty slot)
 *   hash[p].v.LH        — link to next entry in collision chain
 *   strpool[strstart[s]..strstart[s+1]-1] — characters of string s
 *
 * Constants:
 *   hashoffset = 514    — base index of hash array
 *   hashtop              — highest valid hash index
 *   26627                — frozen_control_sequence (undefined CS placeholder)
 *
 * Filters applied:
 *   - Skip empty slots (hash[p].v.RH == 0)
 *   - Skip undefined CS (zeqtb[p].hh eq_type == 0)
 *   - Skip single-character control sequences
 *   - Observe selected LaTeX registry prefixes before excluding public-command internals
 *   - Bound names/records and report every conservative coverage drop
 * ========================================================================== */

#include <stdio.h>
#include <string.h>

/* --------------------------------------------------------------------------
 * Type definitions matching web2c wasm32 layout
 * (SIZEOF_LONG=4, little-endian, not SMALLTeX, not Aleph)
 *
 * We use standalone declarations instead of #include "pdftexd.h" to avoid
 * pulling in the full texmfmp.h include chain which can conflict with
 * Emscripten internals.
 * -------------------------------------------------------------------------- */

typedef int integer;
typedef int halfword;
typedef integer poolpointer;
typedef integer strnumber;
typedef unsigned char packedASCIIcode;

/* twohalves — used for hash[] entries and inside memoryword.hh */
typedef union {
    struct { halfword LH, RH; } v;      /* little-endian */
    struct { short B1, B0; } u;          /* B0 overlaps high 16 bits of LH */
} twohalves;

/* fourquarters — used inside memoryword */
typedef struct {
    struct { unsigned char B3, B2, B1, B0; } u;  /* little-endian */
} fourquarters;

/* memoryword — used for eqtb[] entries */
typedef double glueratio;
typedef union {
    glueratio gr;
    twohalves hh;
    struct { halfword junk; integer CINT; } u;
    struct { halfword junk; fourquarters QQQQ; } v;
} memoryword;

/* --------------------------------------------------------------------------
 * Extern declarations for pdfTeX globals
 * -------------------------------------------------------------------------- */

extern twohalves *hash;           /* hash table (offset by hashoffset=514) */
extern halfword hashtop;          /* highest valid hash index */
extern packedASCIIcode *strpool;  /* string character pool */
extern poolpointer *strstart;     /* string start indices */
extern strnumber strptr;          /* next free string number */
extern memoryword *zeqtb;        /* eqtb array (eq_type, equiv, eq_level) */
extern memoryword *zmem;         /* main memory array (token lists, nodes) */
extern integer memmin;           /* lowest valid zmem index (typically -2000000) */
extern integer memmax;           /* highest valid zmem index (typically 6999999) */

/* hashoffset: hash[514] is the first valid entry */
#define HASH_OFFSET 514

/* frozen_control_sequence: the "undefined CS" placeholder */
#define FROZEN_CS 26627
#define MAX_COMMAND_RECORDS 20000
#define MAX_RUNTIME_RECORDS 4096

/* Count macro arguments by walking the parameter token list.
 * Only valid for user macros (eq_type 111-118).
 *
 * Token list layout for macros:
 *   zmem[equiv] = ref_count node
 *   zmem[equiv].hh.v.RH = link to first parameter/body token
 *   Each token node: .hh.v.LH = info (cmd*256 + chr), .hh.v.RH = link
 *   cmd 13 = match (parameter #N), cmd 14 = end_match (body starts)
 *
 * Returns: 0-9 = argument count, -1 = not a macro or error */
static int count_macro_args(int eqType, int equiv)
{
    if (eqType < 111 || eqType > 118) return -1;
    /* zmem is offset-adjusted (zmem = yzmem - memmin), so valid indices
     * are [memmin, memmax]. Out-of-range access causes WASM OOB trap. */
    if (equiv < memmin || equiv > memmax) return -1;

    /* Skip ref_count node — first actual token is at link */
    int q = zmem[equiv].hh.v.RH;
    int count = 0;
    int iters = 0;

    while (q != 0 && iters < 1000) {
        if (q < memmin || q > memmax) return -1;  /* bounds check */
        int info = zmem[q].hh.v.LH;
        int cmd = info / 256;

        if (cmd == 14) break;   /* end_match: replacement body starts */
        if (cmd == 13) count++; /* match: parameter #N */

        q = zmem[q].hh.v.RH;
        iters++;
    }

    if (count > 9) count = 9;  /* TeX maximum is 9 parameters */
    return count;
}

void scanHashTable(void)
{
    FILE *f = fopen("/work/.commands", "w");
    if (!f) return;
    FILE *runtime = fopen("/work/.completion-observations", "w");
    int command_records = 0;
    int command_dropped = 0;
    int counter_records = 0;
    int counter_dropped = 0;
    int color_records = 0;
    int color_dropped = 0;
    int key_records = 0;
    int key_dropped = 0;

    int p;
    for (p = HASH_OFFSET; p <= hashtop; p++) {
        /* Skip the frozen "undefined control sequence" slot */
        if (p == FROZEN_CS) continue;

        /* Skip empty slots (no name string assigned) */
        strnumber s = hash[p].v.RH;
        if (s <= 0) continue;

        /* Skip undefined control sequences (eq_type == 0) */
        if (zeqtb[p].hh.u.B0 == 0) continue;

        /* Bounds check the string number */
        if (s >= strptr) continue;

        /* Get string length and content pointer */
        poolpointer start = strstart[s];
        poolpointer end = strstart[s + 1];
        int len = end - start;

        /* Skip single-character control sequences */
        if (len <= 1) continue;

        /* A name outside the protocol bound could belong to any observed field.
         * Drop it conservatively and make all affected coverage claims incomplete. */
        if (len > 200) {
            command_dropped++;
            counter_dropped++;
            color_dropped++;
            key_dropped++;
            continue;
        }

        /* Copy once, rejecting control characters so the tab-delimited protocol
         * remains one record per line. Internal names are retained only long enough
         * to recognize bounded runtime semantic registries below. */
        char buf[201];
        int unsafe = 0;
        int i;
        for (i = 0; i < len; i++) {
            unsigned char ch = strpool[start + i];
            if (ch < 32 || ch == 127) { unsafe = 1; break; }
            buf[i] = (char)ch;
        }
        if (unsafe) {
            command_dropped++;
            counter_dropped++;
            color_dropped++;
            key_dropped++;
            continue;
        }
        buf[len] = '\0';

        /* Standard LaTeX registries with stable, documented naming conventions.
         * These are observations only: unknown package-specific encodings are not
         * guessed and remain explicitly unsupported in the host snapshot. */
        if (runtime && strncmp(buf, "c@", 2) == 0 && len > 2) {
            if (counter_records < MAX_RUNTIME_RECORDS) {
                if (fprintf(runtime, "counter\t%s\n", buf + 2) < 0) {
                    counter_dropped++;
                } else {
                    counter_records++;
                }
            } else {
                counter_dropped++;
            }
        /* xcolor stores user color names under a control-sequence name that
         * literally starts with "\\color@". Names beginning only with "color@"
         * are model/conversion internals (for example color@RGB). */
        } else if (runtime && strncmp(buf, "\\color@", 7) == 0 && len > 7) {
            if (color_records < MAX_RUNTIME_RECORDS) {
                if (fprintf(runtime, "color\t%s\n", buf + 7) < 0) {
                    color_dropped++;
                } else {
                    color_records++;
                }
            } else {
                color_dropped++;
            }
        } else if (runtime && strncmp(buf, "KV@", 3) == 0) {
            char *separator = strchr(buf + 3, '@');
            if (separator && separator > buf + 3 && separator[1] != '\0') {
                if (key_records < MAX_RUNTIME_RECORDS) {
                    if (fprintf(runtime, "key\t%.*s\t%s\n",
                                (int)(separator - (buf + 3)),
                                buf + 3, separator + 1) < 0) {
                        key_dropped++;
                    } else {
                        key_records++;
                    }
                } else {
                    key_dropped++;
                }
            }
        }

        /* Public command inventory excludes LaTeX2e/expl3 internals. In standard
         * LaTeX, '_' and ':' become letters only inside expl3 code. */
        if (strchr(buf, '@') || strchr(buf, '_') || strchr(buf, ':')) continue;
        if (command_records >= MAX_COMMAND_RECORDS) {
            command_dropped++;
            continue;
        }

        int eqType = (int)zeqtb[p].hh.u.B0;
        int argCount = count_macro_args(eqType, zeqtb[p].hh.v.RH);
        if (fprintf(f, "%s\t%d\t%d\n", buf, eqType, argCount) < 0) {
            command_dropped++;
        } else {
            command_records++;
        }
    }

    if (fflush(f) != 0) command_dropped++;
    fclose(f);
    if (runtime) {
        if (fflush(runtime) != 0) {
            counter_dropped++;
            color_dropped++;
            key_dropped++;
            clearerr(runtime);
        }
        fprintf(runtime, "meta\tcounter\t%d\n", counter_dropped);
        fprintf(runtime, "meta\tcolor\t%d\n", color_dropped);
        fprintf(runtime, "meta\tkey\t%d\n", key_dropped);
        fclose(runtime);
    }
    FILE *command_meta = fopen("/work/.commands-meta", "w");
    if (command_meta) {
        fprintf(command_meta, "%d\n", command_dropped);
        fclose(command_meta);
    }
}
