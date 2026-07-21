// SPDX-License-Identifier: MIT

#include "wtpdf.h"

#include <cstdlib>
#include <cstring>
#include <limits.h>
#include <new>
#include <sys/stat.h>

#include "aconf.h"
#include "GString.h"
#include "Object.h"
#include "Stream.h"
#include "XRef.h"
#include "Catalog.h"
#include "ErrorCodes.h"
#include "GlobalParams.h"
#include "PDFDoc.h"
#include "Page.h"

struct wtpdf_document {
  unsigned char *input;
  size_t input_size;
  PDFDoc *pdf;

  wtpdf_document() : input(NULL), input_size(0), pdf(NULL) {}
};

namespace {

void set_status(wtpdf_status *target, wtpdf_status status) {
  if (target) {
    *target = status;
  }
}

bool valid_options(const wtpdf_open_options *options) {
  return !options || options->struct_size >= sizeof(wtpdf_open_options);
}

size_t input_limit(const wtpdf_open_options *options) {
  return options ? options->max_input_bytes : 0;
}

GString *make_password(const char *password) {
  return password ? new (std::nothrow) GString(password) : NULL;
}

bool ensure_global_params() {
  /*
   * Xpdf 4.04 exposes process-global parser configuration. WasmTex runs one
   * engine per Worker, so retaining this object for that Worker's lifetime
   * avoids invalidating live documents and mirrors the engine process model.
   */
  if (!globalParams) {
    globalParams = new (std::nothrow) GlobalParams();
  }
  return globalParams != NULL;
}

wtpdf_status map_xpdf_error(int error_code) {
  switch (error_code) {
    case errOpenFile:
    case errFileIO:
      return WTPDF_STATUS_OPEN_FAILED;
    case errBadCatalog:
      return WTPDF_STATUS_BAD_CATALOG;
    case errDamaged:
      return WTPDF_STATUS_DAMAGED;
    case errEncrypted:
      return WTPDF_STATUS_ENCRYPTED;
    case errBadPageNum:
      return WTPDF_STATUS_BAD_PAGE;
    default:
      return WTPDF_STATUS_INTERNAL_ERROR;
  }
}

wtpdf_document *finish_open(wtpdf_document *document,
                            GString *owner_password,
                            GString *user_password,
                            BaseStream *stream,
                            GString *filename,
                            wtpdf_status *status) {
  if (stream) {
    document->pdf =
        new (std::nothrow) PDFDoc(stream, owner_password, user_password);
  } else {
    document->pdf =
        new (std::nothrow) PDFDoc(filename, owner_password, user_password);
  }
  delete owner_password;
  delete user_password;

  if (!document->pdf) {
    delete stream;
    delete filename;
    std::free(document->input);
    delete document;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }

  if (!document->pdf->isOk()) {
    set_status(status, map_xpdf_error(document->pdf->getErrorCode()));
    delete document->pdf;
    std::free(document->input);
    delete document;
    return NULL;
  }

  set_status(status, WTPDF_STATUS_OK);
  return document;
}

Page *get_page(const wtpdf_document *document, int page_number) {
  if (!document || !document->pdf || page_number < 1 ||
      page_number > document->pdf->getNumPages()) {
    return NULL;
  }
  Page *page = document->pdf->getCatalog()->getPage(page_number);
  return page && page->isOk() ? page : NULL;
}

}  // namespace

extern "C" {

unsigned int wtpdf_abi_version(void) { return WTPDF_ABI_VERSION; }

const char *wtpdf_backend_name(void) { return "xpdf"; }

const char *wtpdf_backend_version(void) {
#ifdef XPDF_VERSION
  return XPDF_VERSION;
#else
  return "unknown";
#endif
}

const char *wtpdf_status_message(wtpdf_status status) {
  switch (status) {
    case WTPDF_STATUS_OK:
      return "ok";
    case WTPDF_STATUS_INVALID_ARGUMENT:
      return "invalid argument";
    case WTPDF_STATUS_OUT_OF_MEMORY:
      return "out of memory";
    case WTPDF_STATUS_INPUT_TOO_LARGE:
      return "input exceeds configured limit";
    case WTPDF_STATUS_OPEN_FAILED:
      return "could not open PDF input";
    case WTPDF_STATUS_BAD_CATALOG:
      return "invalid PDF catalog";
    case WTPDF_STATUS_DAMAGED:
      return "damaged PDF could not be repaired";
    case WTPDF_STATUS_ENCRYPTED:
      return "PDF password missing or incorrect";
    case WTPDF_STATUS_BAD_PAGE:
      return "invalid PDF page";
    case WTPDF_STATUS_INTERNAL_ERROR:
      return "PDF backend error";
  }
  return "unknown PDF backend status";
}

void wtpdf_open_options_init(wtpdf_open_options *options) {
  if (!options) {
    return;
  }
  options->struct_size = sizeof(*options);
  options->owner_password = NULL;
  options->user_password = NULL;
  options->max_input_bytes = 0;
}

wtpdf_document *wtpdf_document_open_file(const char *path,
                                         const wtpdf_open_options *options,
                                         wtpdf_status *status) {
  set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
  if (!path || !path[0] || !valid_options(options)) {
    return NULL;
  }

  const size_t limit = input_limit(options);
  if (limit) {
    struct stat input_stat;
    if (stat(path, &input_stat) == 0 && input_stat.st_size >= 0 &&
        static_cast<unsigned long long>(input_stat.st_size) > limit) {
      set_status(status, WTPDF_STATUS_INPUT_TOO_LARGE);
      return NULL;
    }
  }

  if (!ensure_global_params()) {
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  wtpdf_document *document = new (std::nothrow) wtpdf_document();
  GString *filename = new (std::nothrow) GString(path);
  if (!document || !filename) {
    delete document;
    delete filename;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  GString *owner = make_password(options ? options->owner_password : NULL);
  GString *user = make_password(options ? options->user_password : NULL);
  if ((options && options->owner_password && !owner) ||
      (options && options->user_password && !user)) {
    delete owner;
    delete user;
    delete filename;
    delete document;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  return finish_open(document, owner, user, NULL, filename, status);
}

wtpdf_document *wtpdf_document_open_memory(const unsigned char *bytes,
                                           size_t size,
                                           const wtpdf_open_options *options,
                                           wtpdf_status *status) {
  set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
  if ((!bytes && size) || !size || !valid_options(options) || size > UINT_MAX) {
    return NULL;
  }
  const size_t limit = input_limit(options);
  if (limit && size > limit) {
    set_status(status, WTPDF_STATUS_INPUT_TOO_LARGE);
    return NULL;
  }

  if (!ensure_global_params()) {
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  wtpdf_document *document = new (std::nothrow) wtpdf_document();
  if (!document) {
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  document->input = static_cast<unsigned char *>(std::malloc(size));
  if (!document->input) {
    delete document;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  document->input_size = size;
  std::memcpy(document->input, bytes, size);

  Object dictionary;
  dictionary.initNull();
  BaseStream *stream = new (std::nothrow) MemStream(
      reinterpret_cast<char *>(document->input), 0, static_cast<Guint>(size),
      &dictionary);
  if (!stream) {
    std::free(document->input);
    delete document;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  GString *owner = make_password(options ? options->owner_password : NULL);
  GString *user = make_password(options ? options->user_password : NULL);
  if ((options && options->owner_password && !owner) ||
      (options && options->user_password && !user)) {
    delete owner;
    delete user;
    delete stream;
    std::free(document->input);
    delete document;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  return finish_open(document, owner, user, stream, NULL, status);
}

void wtpdf_document_close(wtpdf_document *document) {
  if (!document) {
    return;
  }
  delete document->pdf;
  document->pdf = NULL;
  std::free(document->input);
  document->input = NULL;
  document->input_size = 0;
  delete document;
}

int wtpdf_document_page_count(const wtpdf_document *document) {
  return document && document->pdf ? document->pdf->getNumPages() : 0;
}

double wtpdf_document_pdf_version(const wtpdf_document *document) {
  return document && document->pdf ? document->pdf->getPDFVersion() : 0;
}

int wtpdf_document_is_encrypted(const wtpdf_document *document) {
  return document && document->pdf && document->pdf->isEncrypted() ? 1 : 0;
}

wtpdf_status wtpdf_document_page_box(const wtpdf_document *document,
                                     int page_number,
                                     wtpdf_page_box box,
                                     wtpdf_rectangle *rectangle) {
  if (!rectangle) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  Page *page = get_page(document, page_number);
  if (!page) {
    return WTPDF_STATUS_BAD_PAGE;
  }

  PDFRectangle *source = NULL;
  switch (box) {
    case WTPDF_PAGE_BOX_MEDIA:
      source = page->getMediaBox();
      break;
    case WTPDF_PAGE_BOX_CROP:
      source = page->getCropBox();
      break;
    case WTPDF_PAGE_BOX_BLEED:
      source = page->getBleedBox();
      break;
    case WTPDF_PAGE_BOX_TRIM:
      source = page->getTrimBox();
      break;
    case WTPDF_PAGE_BOX_ART:
      source = page->getArtBox();
      break;
    default:
      return WTPDF_STATUS_INVALID_ARGUMENT;
  }

  if (!source) {
    return WTPDF_STATUS_BAD_PAGE;
  }
  rectangle->x1 = source->x1;
  rectangle->y1 = source->y1;
  rectangle->x2 = source->x2;
  rectangle->y2 = source->y2;
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_document_page_rotation(const wtpdf_document *document,
                                          int page_number,
                                          int *degrees) {
  if (!degrees) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  Page *page = get_page(document, page_number);
  if (!page) {
    return WTPDF_STATUS_BAD_PAGE;
  }
  int rotation = page->getRotate() % 360;
  if (rotation < 0) {
    rotation += 360;
  }
  *degrees = rotation;
  return WTPDF_STATUS_OK;
}

}  // extern "C"
