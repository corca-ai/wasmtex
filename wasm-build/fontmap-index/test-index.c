/* SPDX-License-Identifier: GPL-2.0-or-later
 * Differential test compiled with the exact upstream hash-table implementation.
 * The runner includes this after that implementation, not a duplicate model.
 */
#include <time.h>
static int fail_after = -1;
static void *index_calloc(size_t count, size_t bytes) {
  if (fail_after == 0) return NULL;
  if (fail_after > 0) fail_after--;
  return calloc(count, bytes);
}
#define calloc index_calloc
#include "fontmap-index.h"
#undef calloc

struct value { unsigned id; int side; };
static unsigned long long freed[2];
static unsigned counts[2];
static void drop(void *p) {
  struct value *v = p;
  freed[v->side] = freed[v->side] * 33 + v->id;
  counts[v->side]++;
  free(v);
}
static struct value *value(unsigned id, int side) {
  struct value *v = malloc(sizeof(*v)); assert(v);
  v->id = id; v->side = side; return v;
}
static void equal_value(void *a, void *b) {
  assert((a == NULL) == (b == NULL));
  if (a) assert(((struct value *)a)->id == ((struct value *)b)->id);
}
static void equivalent(struct ht_table *a, struct ht_table *b) {
  struct ht_iter ia, ib;
  int sa = ht_set_iter(a, &ia), sb = ht_set_iter(b, &ib);
  assert(a->count == b->count && sa == sb);
  while (sa == 0) {
    int la, lb;
    char *ka = ht_iter_getkey(&ia, &la), *kb = ht_iter_getkey(&ib, &lb);
    assert(la == lb && !memcmp(ka, kb, la));
    equal_value(ht_iter_getval(&ia), ht_iter_getval(&ib));
    equal_value(ht_lookup_table(a, ka, la), wasmtex_fontmap_lookup(b, ka, la));
    sa = ht_iter_next(&ia); sb = ht_iter_next(&ib); assert(sa == sb);
  }
  ht_clear_iter(&ia); ht_clear_iter(&ib);
  assert(freed[0] == freed[1] && counts[0] == counts[1]);
}
static void differential(int allocation_failure) {
  struct ht_table plain;
  struct ht_table *indexed;
  unsigned i, rng = 17;
  unsigned char keys[3000][12];
  int lengths[3000];
  memset(freed, 0, sizeof(freed)); memset(counts, 0, sizeof(counts));
  ht_init_table(&plain, drop);
  fail_after = allocation_failure;
  indexed = wasmtex_fontmap_new(drop);
  /* Embedded NULs, high-bit bytes, empty key, and many old-bucket collisions. */
  for (i = 0; i < 3000; i++) {
    unsigned j;
    lengths[i] = i == 0 ? 0 : 12;
    for (j = 0; j < 12; j++) { rng = rng * 1664525u + 1013904223u; keys[i][j] = rng >> 24; }
    ht_insert_table(&plain, keys[i], lengths[i], value(i, 0));
    wasmtex_fontmap_insert(indexed, keys[i], lengths[i], value(i, 1));
  }
  equivalent(&plain, indexed);
  for (i = 0; i < 30000; i++) {
    unsigned key, op;
    rng = rng * 1664525u + 1013904223u; key = rng % 3000;
    rng = rng * 1664525u + 1013904223u; op = (rng >> 16) % 4;
    if (op == 0) {
      assert(ht_remove_table(&plain, keys[key], lengths[key]) == wasmtex_fontmap_remove(indexed, keys[key], lengths[key]));
    } else if (op == 1 || op == 2) {
      void *a = op == 1 ? value(i + 3000, 0) : NULL;
      void *b = op == 1 ? value(i + 3000, 1) : NULL;
      ht_insert_table(&plain, keys[key], lengths[key], a);
      wasmtex_fontmap_insert(indexed, keys[key], lengths[key], b);
    } else equal_value(ht_lookup_table(&plain, keys[key], lengths[key]), wasmtex_fontmap_lookup(indexed, keys[key], lengths[key]));
    if (i % 251 == 0) equivalent(&plain, indexed);
  }
  equivalent(&plain, indexed);
  ht_clear_table(&plain); wasmtex_fontmap_clear(indexed);
  equivalent(&plain, indexed);
  /* Upstream clear sets the destructor to NULL; reuse must preserve that too. */
  ht_insert_table(&plain, "again", 5, NULL); wasmtex_fontmap_insert(indexed, "again", 5, NULL);
  equivalent(&plain, indexed);
  ht_clear_table(&plain); wasmtex_fontmap_clear(indexed); free(indexed);
  assert(freed[0] == freed[1] && counts[0] == counts[1]);
  fail_after = -1;
}
static void benchmark(const char *path) {
  FILE *file = fopen(path, "rb");
  char line[4096]; char **keys = NULL; int *lengths = NULL;
  size_t n = 0, i; int repetition;
  assert(file);
  while (fgets(line, sizeof(line), file)) {
    size_t length = strcspn(line, " \t\r\n");
    if (!length || line[0] == '%' || line[0] == '#') continue;
    keys = realloc(keys, (n + 1) * sizeof(*keys)); lengths = realloc(lengths, (n + 1) * sizeof(*lengths));
    assert(keys && lengths); keys[n] = malloc(length); assert(keys[n]);
    memcpy(keys[n], line, length); lengths[n++] = (int)length;
  }
  fclose(file);
  for (repetition = 0; repetition < 6; repetition++) {
    struct ht_table plain, *indexed;
    clock_t start; double baseline, candidate;
    ht_init_table(&plain, NULL); indexed = wasmtex_fontmap_new(NULL);
    start = clock();
    for (i = 0; i < n; i++) ht_insert_table(&plain, keys[i], lengths[i], NULL);
    baseline = 1000.0 * (clock() - start) / CLOCKS_PER_SEC;
    start = clock();
    for (i = 0; i < n; i++) wasmtex_fontmap_insert(indexed, keys[i], lengths[i], NULL);
    candidate = 1000.0 * (clock() - start) / CLOCKS_PER_SEC;
    equivalent(&plain, indexed);
    printf("map keys=%zu original_ms=%.3f indexed_ms=%.3f index_bytes=%zu\n", n, baseline, candidate,
      ((struct wasmtex_fontmap_table *)indexed)->capacity * sizeof(void *) + sizeof(((struct wasmtex_fontmap_table *)indexed)->tails));
    ht_clear_table(&plain); wasmtex_fontmap_clear(indexed); free(indexed);
  }
  for (i = 0; i < n; i++) free(keys[i]); free(keys); free(lengths);
}
int main(int argc, char **argv) {
  int i;
  for (i = 0; i < 3; i++) { differential(-1); differential(0); differential(1); differential(2); }
  puts("differential operations, iteration, destruction and allocation fallback: PASS");
  if (argc > 1) benchmark(argv[1]);
  return 0;
}
