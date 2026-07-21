/* SPDX-License-Identifier: MIT */
#ifndef WASMTEX_WTPDF_H
#define WASMTEX_WTPDF_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define WTPDF_ABI_VERSION 1u

typedef struct wtpdf_document wtpdf_document;

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
  WTPDF_STATUS_INTERNAL_ERROR = 9
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

/*
 * Set struct_size to sizeof(wtpdf_open_options). A zero max_input_bytes means
 * that this adapter does not impose an input-size limit. Password pointers are
 * borrowed only for the duration of the open call.
 */
typedef struct wtpdf_open_options {
  size_t struct_size;
  const char *owner_password;
  const char *user_password;
  size_t max_input_bytes;
} wtpdf_open_options;

unsigned int wtpdf_abi_version(void);
const char *wtpdf_backend_name(void);
const char *wtpdf_backend_version(void);
const char *wtpdf_status_message(wtpdf_status status);

void wtpdf_open_options_init(wtpdf_open_options *options);

/*
 * File paths are borrowed for the duration of the call. Memory input is copied
 * before parsing and remains owned by the returned document until close.
 */
wtpdf_document *wtpdf_document_open_file(const char *path,
                                         const wtpdf_open_options *options,
                                         wtpdf_status *status);
wtpdf_document *wtpdf_document_open_memory(const unsigned char *bytes,
                                           size_t size,
                                           const wtpdf_open_options *options,
                                           wtpdf_status *status);
void wtpdf_document_close(wtpdf_document *document);

int wtpdf_document_page_count(const wtpdf_document *document);
double wtpdf_document_pdf_version(const wtpdf_document *document);
int wtpdf_document_is_encrypted(const wtpdf_document *document);

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
