/* SPDX-License-Identifier: MIT */
#ifndef WASMTEX_WTPDF_H
#define WASMTEX_WTPDF_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define WTPDF_ABI_VERSION 3u

#define WTPDF_DEFAULT_MAX_INPUT_BYTES (256u * 1024u * 1024u)
#define WTPDF_DEFAULT_MAX_OBJECT_DEPTH 256u
#define WTPDF_DEFAULT_MAX_DECODED_STREAM_BYTES (256u * 1024u * 1024u)
#define WTPDF_DEFAULT_MAX_ADAPTER_BYTES (512u * 1024u * 1024u)

typedef struct wtpdf_document wtpdf_document;
typedef struct wtpdf_value wtpdf_value;
typedef struct wtpdf_stream_reader wtpdf_stream_reader;

typedef enum wtpdf_status {
  WTPDF_STATUS_OK = 0,
  WTPDF_STATUS_INVALID_ARGUMENT = 1,
  WTPDF_STATUS_OUT_OF_MEMORY = 2,
  WTPDF_STATUS_INPUT_TOO_LARGE = 3,
  WTPDF_STATUS_OPEN_FAILED = 4,
  WTPDF_STATUS_BAD_CATALOG = 5,
  WTPDF_STATUS_DAMAGED = 6,
  WTPDF_STATUS_ENCRYPTED = 7,
  WTPDF_STATUS_BAD_PAGE = 8,
  WTPDF_STATUS_INTERNAL_ERROR = 9,
  WTPDF_STATUS_NOT_FOUND = 10,
  WTPDF_STATUS_TYPE_MISMATCH = 11,
  WTPDF_STATUS_OUTPUT_TOO_LARGE = 12,
  WTPDF_STATUS_LOCKED = 13,
  WTPDF_STATUS_BUSY = 14,
  WTPDF_STATUS_DEPTH_LIMIT = 15,
  WTPDF_STATUS_ALLOCATION_LIMIT = 16
} wtpdf_status;

typedef enum wtpdf_page_box {
  WTPDF_PAGE_BOX_MEDIA = 0,
  WTPDF_PAGE_BOX_CROP = 1,
  WTPDF_PAGE_BOX_BLEED = 2,
  WTPDF_PAGE_BOX_TRIM = 3,
  WTPDF_PAGE_BOX_ART = 4
} wtpdf_page_box;

typedef struct wtpdf_rectangle {
  double x1;
  double y1;
  double x2;
  double y2;
} wtpdf_rectangle;

typedef enum wtpdf_value_kind {
  WTPDF_VALUE_NONE = 0,
  WTPDF_VALUE_NULL = 1,
  WTPDF_VALUE_BOOLEAN = 2,
  WTPDF_VALUE_INTEGER = 3,
  WTPDF_VALUE_REAL = 4,
  /* Numeric values intentionally preserve LuaHBTeX pdfe's public type codes. */
  WTPDF_VALUE_NAME = 5,
  WTPDF_VALUE_STRING = 6,
  WTPDF_VALUE_ARRAY = 7,
  WTPDF_VALUE_DICTIONARY = 8,
  WTPDF_VALUE_STREAM = 9,
  WTPDF_VALUE_REFERENCE = 10
} wtpdf_value_kind;

typedef enum wtpdf_lookup_mode {
  WTPDF_LOOKUP_PRESERVE_REFERENCE = 0,
  WTPDF_LOOKUP_RESOLVE_REFERENCE = 1
} wtpdf_lookup_mode;

typedef enum wtpdf_stream_mode {
  WTPDF_STREAM_RAW = 0,
  WTPDF_STREAM_DECODED = 1
} wtpdf_stream_mode;

typedef enum wtpdf_string_syntax {
  WTPDF_STRING_LITERAL = 0,
  WTPDF_STRING_HEX = 1
} wtpdf_string_syntax;

/*
 * Initialize with wtpdf_open_options_init(), then override individual limits as
 * needed. A zero limit explicitly disables that limit. Password pointers are
 * borrowed only for the duration of the open/authenticate call.
 */
typedef struct wtpdf_open_options {
  size_t struct_size;
  const char *owner_password;
  const char *user_password;
  size_t max_input_bytes;
  size_t max_object_depth;
  size_t max_decoded_stream_bytes;
  size_t max_adapter_bytes;
} wtpdf_open_options;

unsigned int wtpdf_abi_version(void);
const char *wtpdf_backend_name(void);
const char *wtpdf_backend_version(void);
const char *wtpdf_status_message(wtpdf_status status);

void wtpdf_open_options_init(wtpdf_open_options *options);

/*
 * File paths and memory input are copied so an encrypted document can be
 * authenticated after open. An encrypted document is returned as a live,
 * locked handle with WTPDF_STATUS_ENCRYPTED. Queries that need parsed objects
 * remain unavailable until authentication succeeds.
 */
wtpdf_document *wtpdf_document_open_file(const char *path,
                                         const wtpdf_open_options *options,
                                         wtpdf_status *status);
wtpdf_document *wtpdf_document_open_memory(const unsigned char *bytes,
                                           size_t size,
                                           const wtpdf_open_options *options,
                                           wtpdf_status *status);
void wtpdf_document_close(wtpdf_document *document);

/* Authentication is rejected while values or readers from the document live. */
wtpdf_status wtpdf_document_authenticate(wtpdf_document *document,
                                         const char *owner_password,
                                         const char *user_password);

int wtpdf_document_page_count(const wtpdf_document *document);
double wtpdf_document_pdf_version(const wtpdf_document *document);
int wtpdf_document_is_encrypted(const wtpdf_document *document);
int wtpdf_document_is_locked(const wtpdf_document *document);
size_t wtpdf_document_input_size(const wtpdf_document *document);
int wtpdf_document_object_count(const wtpdf_document *document);
size_t wtpdf_document_adapter_bytes(const wtpdf_document *document);
size_t wtpdf_document_child_handle_count(const wtpdf_document *document);

/*
 * Every returned value is independently owned and must be destroyed. The
 * document must outlive values and readers created from it.
 * Catalog and info promise a dictionary: when the document has no such
 * dictionary (an absent /Info, a corrupt root) they return NULL with
 * WTPDF_STATUS_NOT_FOUND rather than a null-kind value.
 */
wtpdf_value *wtpdf_document_catalog(const wtpdf_document *document,
                                    wtpdf_status *status);
wtpdf_value *wtpdf_document_trailer(const wtpdf_document *document,
                                    wtpdf_status *status);
wtpdf_value *wtpdf_document_info(const wtpdf_document *document,
                                 wtpdf_status *status);
wtpdf_value *wtpdf_document_page(const wtpdf_document *document,
                                 int page_number,
                                 wtpdf_lookup_mode mode,
                                 wtpdf_status *status);
wtpdf_value *wtpdf_document_object(const wtpdf_document *document,
                                   int object_number,
                                   int generation_number,
                                   wtpdf_status *status);

void wtpdf_value_destroy(wtpdf_value *value);
wtpdf_value_kind wtpdf_value_type(const wtpdf_value *value);
wtpdf_value *wtpdf_value_resolve(const wtpdf_value *value,
                                 wtpdf_status *status);

wtpdf_status wtpdf_value_get_boolean(const wtpdf_value *value, int *result);
wtpdf_status wtpdf_value_get_integer(const wtpdf_value *value,
                                     long long *result);
wtpdf_status wtpdf_value_get_real(const wtpdf_value *value, double *result);
wtpdf_status wtpdf_value_get_string(const wtpdf_value *value,
                                    const unsigned char **bytes,
                                    size_t *size);
wtpdf_status wtpdf_value_get_string_syntax(const wtpdf_value *value,
                                           wtpdf_string_syntax *syntax);
wtpdf_status wtpdf_value_get_name(const wtpdf_value *value,
                                  const unsigned char **bytes,
                                  size_t *size);
wtpdf_status wtpdf_value_get_reference(const wtpdf_value *value,
                                       int *object_number,
                                       int *generation_number);

wtpdf_status wtpdf_value_count(const wtpdf_value *value, size_t *count);
wtpdf_value *wtpdf_array_get(const wtpdf_value *array,
                             size_t index,
                             wtpdf_lookup_mode mode,
                             wtpdf_status *status);
wtpdf_value *wtpdf_dictionary_get(const wtpdf_value *dictionary,
                                  const unsigned char *key,
                                  size_t key_size,
                                  wtpdf_lookup_mode mode,
                                  wtpdf_status *status);
wtpdf_value *wtpdf_dictionary_at(const wtpdf_value *dictionary,
                                 size_t index,
                                 const unsigned char **key,
                                 size_t *key_size,
                                 wtpdf_lookup_mode mode,
                                 wtpdf_status *status);
wtpdf_value *wtpdf_stream_dictionary(const wtpdf_value *stream,
                                     wtpdf_status *status);

wtpdf_stream_reader *wtpdf_stream_reader_open(const wtpdf_value *stream,
                                              wtpdf_stream_mode mode,
                                              wtpdf_status *status);
wtpdf_status wtpdf_stream_reader_reset(wtpdf_stream_reader *reader);
wtpdf_status wtpdf_stream_reader_read(wtpdf_stream_reader *reader,
                                      unsigned char *buffer,
                                      size_t capacity,
                                      size_t *bytes_read,
                                      int *at_eof);
void wtpdf_stream_reader_close(wtpdf_stream_reader *reader);

/* Page numbers are one-based. Rotation is normalized to [0, 359]. */
wtpdf_status wtpdf_document_page_box(const wtpdf_document *document,
                                     int page_number,
                                     wtpdf_page_box box,
                                     wtpdf_rectangle *rectangle);
wtpdf_status wtpdf_document_page_rotation(const wtpdf_document *document,
                                          int page_number,
                                          int *degrees);

#ifdef __cplusplus
}
#endif

#endif
