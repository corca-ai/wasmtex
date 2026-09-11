/* SPDX-License-Identifier: GPL-2.0-or-later
 * Font-map-only index for dvipdfmx. Record allocation/replacement follows
 * TeX Live's dpxutil.c (Jin-Hwan Cho, Shunsaku Hirata, Mark A. Wicks).
 * The upstream linked lists remain authoritative for traversal and destruction.
 * No entry or index survives pdf_close_fontmaps / the worker heap reset.
 */
/* This is dvipdfmx, an eXtended version of dvipdfm by Mark A. Wicks.

    Copyright (C) 2002-2023 by Jin-Hwan Cho and Shunsaku Hirata,
    the dvipdfmx project team.

    Copyright (C) 1998, 1999 by Mark A. Wicks <mwicks@kettering.edu>

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program; if not, write to the Free Software
    Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA 02111-1307 USA.
*/

#ifndef WASMTEX_FONTMAP_INDEX_H
#define WASMTEX_FONTMAP_INDEX_H
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

struct wasmtex_fontmap_table {
  struct ht_table legacy; /* first member: existing iterators see the original ABI */
  struct ht_entry *tails[HASH_TABLE_SIZE];
  struct ht_entry **slots;
  size_t capacity;
};

/* Keep signed-char behavior identical to upstream get_hash for list placement. */
static unsigned int wf_hash(const void *key, int length)
{
  unsigned int hash = 0;
  int i;
  for (i = 0; i < length; i++) hash = (hash << 5) + hash + ((const char *)key)[i];
  return hash;
}

static size_t wf_slot(struct ht_entry **slots, size_t capacity,
                      const void *key, int length, unsigned int hash)
{
  size_t at = (hash ^ (hash >> 16)) & (capacity - 1);
  while (slots[at]) {
    if (slots[at]->keylen == length && !memcmp(slots[at]->key, key, length)) break;
    at = (at + 1) & (capacity - 1);
  }
  return at;
}

/* An optional index allocation failure returns to the unchanged upstream path. */
static void wf_disable(struct wasmtex_fontmap_table *table)
{
  free(table->slots);
  table->slots = NULL;
  table->capacity = 0;
}

static int wf_resize(struct wasmtex_fontmap_table *table, size_t capacity)
{
  struct ht_entry **slots;
  size_t i;
  if (capacity > SIZE_MAX / sizeof(*slots)) { wf_disable(table); return 0; }
  slots = calloc(capacity, sizeof(*slots));
  if (!slots) { wf_disable(table); return 0; }
  for (i = 0; i < table->capacity; i++) {
    struct ht_entry *entry = table->slots[i];
    if (entry) slots[wf_slot(slots, capacity, entry->key, entry->keylen,
                            wf_hash(entry->key, entry->keylen))] = entry;
  }
  free(table->slots);
  table->slots = slots;
  table->capacity = capacity;
  return 1;
}

static struct ht_table *wasmtex_fontmap_new(hval_free_func free_value)
{
  struct wasmtex_fontmap_table *table = NEW(1, struct wasmtex_fontmap_table);
  memset(table, 0, sizeof(*table));
  ht_init_table(&table->legacy, free_value);
  wf_resize(table, 1024);
  return &table->legacy;
}

static void *wasmtex_fontmap_lookup(struct ht_table *legacy, const void *key, int length)
{
  struct wasmtex_fontmap_table *table = (struct wasmtex_fontmap_table *)legacy;
  struct ht_entry *entry;
  ASSERT(legacy && key);
  if (!table->capacity) return ht_lookup_table(legacy, key, length);
  entry = table->slots[wf_slot(table->slots, table->capacity, key, length, wf_hash(key, length))];
  return entry ? entry->value : NULL;
}

static void wasmtex_fontmap_insert(struct ht_table *legacy, const void *key, int length, void *value)
{
  struct wasmtex_fontmap_table *table = (struct wasmtex_fontmap_table *)legacy;
  unsigned int hash;
  size_t at, bucket;
  struct ht_entry *entry;
  ASSERT(legacy && key);
  if (!table->capacity) { ht_insert_table(legacy, key, length, value); return; }
  hash = wf_hash(key, length);
  at = wf_slot(table->slots, table->capacity, key, length, hash);
  entry = table->slots[at];
  if (entry) {
    if (entry->value && legacy->hval_free_fn) legacy->hval_free_fn(entry->value);
    entry->value = value;
    return;
  }
  if ((size_t)legacy->count >= table->capacity / 2) {
    if (table->capacity > SIZE_MAX / 2 || !wf_resize(table, table->capacity * 2)) {
      wf_disable(table);
      ht_insert_table(legacy, key, length, value);
      return;
    }
    at = wf_slot(table->slots, table->capacity, key, length, hash);
  }
  entry = NEW(1, struct ht_entry);
  entry->key = NEW(length, char);
  memcpy(entry->key, key, length);
  entry->keylen = length;
  entry->value = value;
  entry->next = NULL;
  bucket = hash % HASH_TABLE_SIZE;
  if (table->tails[bucket]) table->tails[bucket]->next = entry;
  else legacy->table[bucket] = entry;
  table->tails[bucket] = entry;
  table->slots[at] = entry;
  legacy->count++;
}

static int wasmtex_fontmap_remove(struct ht_table *legacy, const void *key, int length)
{
  struct wasmtex_fontmap_table *table = (struct wasmtex_fontmap_table *)legacy;
  unsigned int hash;
  size_t at, next;
  int removed, was_tail;
  struct ht_entry *entry;
  ASSERT(legacy && key);
  if (!table->capacity) return ht_remove_table(legacy, key, length);
  hash = wf_hash(key, length);
  at = wf_slot(table->slots, table->capacity, key, length, hash);
  entry = table->slots[at];
  if (!entry) return 0;
  was_tail = table->tails[hash % HASH_TABLE_SIZE] == entry;
  /* Remove from the index before upstream frees the entry, then repair the
     probe cluster. The upstream routine retains key/value destructor ordering. */
  table->slots[at] = NULL;
  next = (at + 1) & (table->capacity - 1);
  while ((entry = table->slots[next]) != NULL) {
    size_t target;
    table->slots[next] = NULL;
    target = wf_slot(table->slots, table->capacity, entry->key, entry->keylen,
                     wf_hash(entry->key, entry->keylen));
    table->slots[target] = entry;
    next = (next + 1) & (table->capacity - 1);
  }
  removed = ht_remove_table(legacy, key, length);
  if (was_tail) {
    entry = legacy->table[hash % HASH_TABLE_SIZE];
    while (entry && entry->next) entry = entry->next;
    table->tails[hash % HASH_TABLE_SIZE] = entry;
  }
  return removed;
}

static void wasmtex_fontmap_clear(struct ht_table *legacy)
{
  struct wasmtex_fontmap_table *table = (struct wasmtex_fontmap_table *)legacy;
  ht_clear_table(legacy);
  wf_disable(table);
  memset(table->tails, 0, sizeof(table->tails));
}
#endif
