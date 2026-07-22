// SPDX-License-Identifier: MIT

#include "wtpdf.h"

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <limits.h>
#include <new>
#include <string>
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
  char *path;
  PDFDoc *pdf;
  size_t max_object_depth;
  size_t max_decoded_stream_bytes;
  size_t max_adapter_bytes;
  size_t adapter_bytes;
  size_t child_handles;
  bool encrypted;
  bool locked;
  bool close_requested;

  wtpdf_document()
      : input(NULL),
        input_size(0),
        path(NULL),
        pdf(NULL),
        max_object_depth(0),
        max_decoded_stream_bytes(0),
        max_adapter_bytes(0),
        adapter_bytes(sizeof(wtpdf_document)),
        child_handles(0),
        encrypted(false),
        locked(false),
        close_requested(false) {}
};

struct wtpdf_value {
  wtpdf_document *document;
  Object object;
  size_t depth;

  wtpdf_value(wtpdf_document *document_in, size_t depth_in)
      : document(document_in), object(), depth(depth_in) {}
};

struct wtpdf_stream_reader {
  wtpdf_document *document;
  Stream *stream;
  size_t bytes_emitted;
  size_t max_bytes;

  wtpdf_stream_reader()
      : document(NULL), stream(NULL), bytes_emitted(0), max_bytes(0) {}
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
  return options ? options->max_input_bytes : WTPDF_DEFAULT_MAX_INPUT_BYTES;
}

size_t object_depth_limit(const wtpdf_open_options *options) {
  return options ? options->max_object_depth : WTPDF_DEFAULT_MAX_OBJECT_DEPTH;
}

size_t decoded_stream_limit(const wtpdf_open_options *options) {
  return options ? options->max_decoded_stream_bytes
                 : WTPDF_DEFAULT_MAX_DECODED_STREAM_BYTES;
}

size_t adapter_limit(const wtpdf_open_options *options) {
  return options ? options->max_adapter_bytes
                 : WTPDF_DEFAULT_MAX_ADAPTER_BYTES;
}

bool checked_add(size_t left, size_t right, size_t *result) {
  if (right > static_cast<size_t>(-1) - left) {
    return false;
  }
  *result = left + right;
  return true;
}

bool reserve_adapter_bytes(wtpdf_document *document, size_t bytes) {
  size_t total = 0;
  if (!document || !checked_add(document->adapter_bytes, bytes, &total) ||
      (document->max_adapter_bytes && total > document->max_adapter_bytes)) {
    return false;
  }
  document->adapter_bytes = total;
  return true;
}

void release_adapter_bytes(wtpdf_document *document, size_t bytes) {
  if (document) {
    document->adapter_bytes =
        bytes <= document->adapter_bytes ? document->adapter_bytes - bytes : 0;
  }
}

void destroy_document(wtpdf_document *document) {
  if (!document) {
    return;
  }
  delete document->pdf;
  document->pdf = NULL;
  std::free(document->input);
  document->input = NULL;
  std::free(document->path);
  document->path = NULL;
  delete document;
}

void release_child(wtpdf_document *document, size_t bytes) {
  if (!document) {
    return;
  }
  if (document->child_handles) {
    --document->child_handles;
  }
  release_adapter_bytes(document, bytes);
  if (document->close_requested && document->child_handles == 0) {
    destroy_document(document);
  }
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

wtpdf_status open_backend(wtpdf_document *document,
                          const char *owner_password,
                          const char *user_password) {
  GString *owner = make_password(owner_password);
  GString *user = make_password(user_password);
  if ((owner_password && !owner) || (user_password && !user)) {
    delete owner;
    delete user;
    return WTPDF_STATUS_OUT_OF_MEMORY;
  }

  if (document->path) {
    GString *filename = new (std::nothrow) GString(document->path);
    if (!filename) {
      delete owner;
      delete user;
      return WTPDF_STATUS_OUT_OF_MEMORY;
    }
    document->pdf = new (std::nothrow) PDFDoc(filename, owner, user);
    if (!document->pdf) {
      delete filename;
    }
  } else {
    Object dictionary;
    dictionary.initNull();
    BaseStream *stream = new (std::nothrow) MemStream(
        reinterpret_cast<char *>(document->input), 0,
        static_cast<Guint>(document->input_size), &dictionary);
    if (!stream) {
      delete owner;
      delete user;
      return WTPDF_STATUS_OUT_OF_MEMORY;
    }
    document->pdf = new (std::nothrow) PDFDoc(stream, owner, user);
    if (!document->pdf) {
      delete stream;
    }
  }
  delete owner;
  delete user;

  if (!document->pdf) {
    return WTPDF_STATUS_OUT_OF_MEMORY;
  }

  if (!document->pdf->isOk()) {
    const wtpdf_status result = map_xpdf_error(document->pdf->getErrorCode());
    delete document->pdf;
    document->pdf = NULL;
    if (result == WTPDF_STATUS_ENCRYPTED) {
      document->encrypted = true;
      document->locked = true;
    }
    return result;
  }

  document->encrypted = document->pdf->isEncrypted();
  document->locked = false;
  return WTPDF_STATUS_OK;
}

Page *get_page(const wtpdf_document *document, int page_number) {
  if (!document || !document->pdf || page_number < 1 ||
      page_number > document->pdf->getNumPages()) {
    return NULL;
  }
  Page *page = document->pdf->getCatalog()->getPage(page_number);
  return page && page->isOk() ? page : NULL;
}

bool usable_document(const wtpdf_document *document) {
  return document && document->pdf && document->pdf->isOk() &&
         document->pdf->getXRef();
}

wtpdf_status document_status(const wtpdf_document *document) {
  if (!document || document->close_requested) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (document->locked) {
    return WTPDF_STATUS_LOCKED;
  }
  if (!document->pdf) {
    return WTPDF_STATUS_OPEN_FAILED;
  }
  if (!document->pdf->isOk()) {
    return WTPDF_STATUS_INTERNAL_ERROR;
  }
  return document->pdf->getXRef() ? WTPDF_STATUS_OK
                                  : WTPDF_STATUS_BAD_CATALOG;
}

bool valid_lookup_mode(wtpdf_lookup_mode mode) {
  return mode == WTPDF_LOOKUP_PRESERVE_REFERENCE ||
         mode == WTPDF_LOOKUP_RESOLVE_REFERENCE;
}

wtpdf_value *copy_value(const wtpdf_document *document,
                        Object *object,
                        size_t depth,
                        wtpdf_status *status) {
  if (!document || !object || object->isError() || object->isEOF() ||
      object->isNone()) {
    set_status(status, WTPDF_STATUS_INTERNAL_ERROR);
    return NULL;
  }
  if (document->max_object_depth && depth > document->max_object_depth) {
    set_status(status, WTPDF_STATUS_DEPTH_LIMIT);
    return NULL;
  }
  wtpdf_document *mutable_document = const_cast<wtpdf_document *>(document);
  if (!reserve_adapter_bytes(mutable_document, sizeof(wtpdf_value))) {
    set_status(status, WTPDF_STATUS_ALLOCATION_LIMIT);
    return NULL;
  }
  wtpdf_value *value =
      new (std::nothrow) wtpdf_value(mutable_document, depth);
  if (!value) {
    release_adapter_bytes(mutable_document, sizeof(wtpdf_value));
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  ++mutable_document->child_handles;
  object->copy(&value->object);
  set_status(status, WTPDF_STATUS_OK);
  return value;
}

wtpdf_value *copy_temporary(const wtpdf_document *document,
                            Object *object,
                            size_t depth,
                            wtpdf_status *status) {
  wtpdf_value *value = copy_value(document, object, depth, status);
  object->free();
  return value;
}

Object *mutable_object(const wtpdf_value *value) {
  return value ? const_cast<Object *>(&value->object) : NULL;
}

wtpdf_value_kind value_kind(Object *object) {
  if (!object) {
    return WTPDF_VALUE_NONE;
  }
  switch (object->getType()) {
    case objNull:
      return WTPDF_VALUE_NULL;
    case objBool:
      return WTPDF_VALUE_BOOLEAN;
    case objInt:
      return WTPDF_VALUE_INTEGER;
    case objReal:
      return WTPDF_VALUE_REAL;
    case objString:
      return WTPDF_VALUE_STRING;
    case objName:
      return WTPDF_VALUE_NAME;
    case objArray:
      return WTPDF_VALUE_ARRAY;
    case objDict:
      return WTPDF_VALUE_DICTIONARY;
    case objStream:
      return WTPDF_VALUE_STREAM;
    case objRef:
      return WTPDF_VALUE_REFERENCE;
    default:
      return WTPDF_VALUE_NONE;
  }
}

Object *container_value(Object *container,
                        size_t index,
                        wtpdf_lookup_mode mode,
                        Object *result) {
  if (container->isArray()) {
    return mode == WTPDF_LOOKUP_RESOLVE_REFERENCE
               ? container->arrayGet(static_cast<int>(index), result)
               : container->arrayGetNF(static_cast<int>(index), result);
  }
  return mode == WTPDF_LOOKUP_RESOLVE_REFERENCE
             ? container->dictGetVal(static_cast<int>(index), result)
             : container->dictGetValNF(static_cast<int>(index), result);
}

}  // namespace

extern "C" {

unsigned int wtpdf_abi_version(void) { return WTPDF_ABI_VERSION; }

const char *wtpdf_backend_name(void) { return "xpdf"; }

const char *wtpdf_backend_version(void) {
#ifdef XPDF_PACKAGE_VERSION
  return XPDF_PACKAGE_VERSION;
#elif defined(XPDF_VERSION)
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
    case WTPDF_STATUS_NOT_FOUND:
      return "PDF value not found";
    case WTPDF_STATUS_TYPE_MISMATCH:
      return "PDF value has the wrong type";
    case WTPDF_STATUS_OUTPUT_TOO_LARGE:
      return "decoded PDF output exceeds configured limit";
    case WTPDF_STATUS_LOCKED:
      return "PDF document is locked";
    case WTPDF_STATUS_BUSY:
      return "PDF document still has live child handles";
    case WTPDF_STATUS_DEPTH_LIMIT:
      return "PDF object traversal exceeds configured depth";
    case WTPDF_STATUS_ALLOCATION_LIMIT:
      return "PDF adapter allocation exceeds configured limit";
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
  options->max_input_bytes = WTPDF_DEFAULT_MAX_INPUT_BYTES;
  options->max_object_depth = WTPDF_DEFAULT_MAX_OBJECT_DEPTH;
  options->max_decoded_stream_bytes =
      WTPDF_DEFAULT_MAX_DECODED_STREAM_BYTES;
  options->max_adapter_bytes = WTPDF_DEFAULT_MAX_ADAPTER_BYTES;
}

wtpdf_document *wtpdf_document_open_file(const char *path,
                                         const wtpdf_open_options *options,
                                         wtpdf_status *status) {
  set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
  if (!path || !path[0] || !valid_options(options)) {
    return NULL;
  }

  const size_t limit = input_limit(options);
  struct stat input_stat;
  const bool have_input_size =
      stat(path, &input_stat) == 0 && input_stat.st_size >= 0;
  if (limit && have_input_size) {
    if (static_cast<unsigned long long>(input_stat.st_size) > limit) {
      set_status(status, WTPDF_STATUS_INPUT_TOO_LARGE);
      return NULL;
    }
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
  document->max_object_depth = object_depth_limit(options);
  document->max_decoded_stream_bytes = decoded_stream_limit(options);
  document->max_adapter_bytes = adapter_limit(options);
  const size_t path_size = std::strlen(path) + 1;
  if (!reserve_adapter_bytes(document, path_size)) {
    delete document;
    set_status(status, WTPDF_STATUS_ALLOCATION_LIMIT);
    return NULL;
  }
  document->path = static_cast<char *>(std::malloc(path_size));
  if (!document->path) {
    delete document;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  std::memcpy(document->path, path, path_size);
  if (have_input_size) {
    document->input_size = static_cast<size_t>(input_stat.st_size);
  }
  const wtpdf_status open_status = open_backend(
      document, options ? options->owner_password : NULL,
      options ? options->user_password : NULL);
  set_status(status, open_status);
  if (open_status == WTPDF_STATUS_OK ||
      open_status == WTPDF_STATUS_ENCRYPTED) {
    return document;
  }
  destroy_document(document);
  return NULL;
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
  document->max_object_depth = object_depth_limit(options);
  document->max_decoded_stream_bytes = decoded_stream_limit(options);
  document->max_adapter_bytes = adapter_limit(options);
  if (!reserve_adapter_bytes(document, size)) {
    delete document;
    set_status(status, WTPDF_STATUS_ALLOCATION_LIMIT);
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
  const wtpdf_status open_status = open_backend(
      document, options ? options->owner_password : NULL,
      options ? options->user_password : NULL);
  set_status(status, open_status);
  if (open_status == WTPDF_STATUS_OK ||
      open_status == WTPDF_STATUS_ENCRYPTED) {
    return document;
  }
  destroy_document(document);
  return NULL;
}

void wtpdf_document_close(wtpdf_document *document) {
  if (!document) {
    return;
  }
  document->close_requested = true;
  if (document->child_handles == 0) {
    destroy_document(document);
  }
}

wtpdf_status wtpdf_document_authenticate(wtpdf_document *document,
                                         const char *owner_password,
                                         const char *user_password) {
  if (!document || document->close_requested) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (document->child_handles) {
    return WTPDF_STATUS_BUSY;
  }
  if (usable_document(document)) {
    return WTPDF_STATUS_OK;
  }
  if (!document->locked) {
    return WTPDF_STATUS_OPEN_FAILED;
  }
  return open_backend(document, owner_password, user_password);
}

int wtpdf_document_page_count(const wtpdf_document *document) {
  return document && document->pdf ? document->pdf->getNumPages() : 0;
}

double wtpdf_document_pdf_version(const wtpdf_document *document) {
  return document && document->pdf ? document->pdf->getPDFVersion() : 0;
}

int wtpdf_document_is_encrypted(const wtpdf_document *document) {
  return document && document->encrypted ? 1 : 0;
}

int wtpdf_document_is_locked(const wtpdf_document *document) {
  return document && document->locked ? 1 : 0;
}

size_t wtpdf_document_input_size(const wtpdf_document *document) {
  return document ? document->input_size : 0;
}

int wtpdf_document_object_count(const wtpdf_document *document) {
  if (!usable_document(document)) {
    return 0;
  }
  const int count = document->pdf->getXRef()->getNumObjects();
  /* LuaHBTeX's public pdfe count excludes xref object zero. */
  return count > 0 ? count - 1 : 0;
}

size_t wtpdf_document_adapter_bytes(const wtpdf_document *document) {
  return document ? document->adapter_bytes : 0;
}

size_t wtpdf_document_child_handle_count(const wtpdf_document *document) {
  return document ? document->child_handles : 0;
}

wtpdf_value *wtpdf_document_catalog(const wtpdf_document *document,
                                    wtpdf_status *status) {
  const wtpdf_status state = document_status(document);
  if (state != WTPDF_STATUS_OK) {
    set_status(status, state);
    return NULL;
  }
  Object object;
  document->pdf->getXRef()->getCatalog(&object);
  if (!object.isDict()) {
    /* pplib parity: ppdoc_catalog returned no dictionary, not a null value. */
    object.free();
    set_status(status, WTPDF_STATUS_NOT_FOUND);
    return NULL;
  }
  return copy_temporary(document, &object, 1, status);
}

wtpdf_value *wtpdf_document_trailer(const wtpdf_document *document,
                                    wtpdf_status *status) {
  const wtpdf_status state = document_status(document);
  if (state != WTPDF_STATUS_OK) {
    set_status(status, state);
    return NULL;
  }
  return copy_value(document, document->pdf->getXRef()->getTrailerDict(), 1,
                    status);
}

wtpdf_value *wtpdf_document_info(const wtpdf_document *document,
                                 wtpdf_status *status) {
  const wtpdf_status state = document_status(document);
  if (state != WTPDF_STATUS_OK) {
    set_status(status, state);
    return NULL;
  }
  Object object;
  document->pdf->getDocInfo(&object);
  if (!object.isDict()) {
    /* An absent /Info comes back from Xpdf as a null object; pplib parity
       (and the pdftoepdf caller) require "no dictionary" instead. */
    object.free();
    set_status(status, WTPDF_STATUS_NOT_FOUND);
    return NULL;
  }
  return copy_temporary(document, &object, 1, status);
}

wtpdf_value *wtpdf_document_page(const wtpdf_document *document,
                                 int page_number,
                                 wtpdf_lookup_mode mode,
                                 wtpdf_status *status) {
  const wtpdf_status state = document_status(document);
  if (state != WTPDF_STATUS_OK || !valid_lookup_mode(mode)) {
    set_status(status, state != WTPDF_STATUS_OK ? state
                                                : WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  Catalog *catalog = document->pdf->getCatalog();
  if (page_number < 1 || page_number > catalog->getNumPages()) {
    set_status(status, WTPDF_STATUS_BAD_PAGE);
    return NULL;
  }
  Ref *reference = catalog->getPageRef(page_number);
  if (!reference) {
    set_status(status, WTPDF_STATUS_BAD_PAGE);
    return NULL;
  }
  Object object;
  object.initRef(reference->num, reference->gen);
  if (mode == WTPDF_LOOKUP_RESOLVE_REFERENCE) {
    Object resolved;
    object.fetch(document->pdf->getXRef(), &resolved);
    object.free();
    return copy_temporary(document, &resolved, 1, status);
  }
  return copy_temporary(document, &object, 1, status);
}

wtpdf_value *wtpdf_document_object(const wtpdf_document *document,
                                   int object_number,
                                   int generation_number,
                                   wtpdf_status *status) {
  const wtpdf_status state = document_status(document);
  if (state != WTPDF_STATUS_OK || object_number < 0 || generation_number < 0) {
    set_status(status, state != WTPDF_STATUS_OK ? state
                                                : WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  XRef *xref = document->pdf->getXRef();
  if (object_number >= xref->getSize()) {
    set_status(status, WTPDF_STATUS_NOT_FOUND);
    return NULL;
  }
  XRefEntry *entry = xref->getEntry(object_number);
  if (!entry || entry->type == xrefEntryFree ||
      (entry->type == xrefEntryUncompressed &&
       entry->gen != generation_number) ||
      (entry->type == xrefEntryCompressed && generation_number != 0)) {
    set_status(status, WTPDF_STATUS_NOT_FOUND);
    return NULL;
  }
  Object object;
  xref->fetch(object_number, generation_number, &object);
  return copy_temporary(document, &object, 1, status);
}

void wtpdf_value_destroy(wtpdf_value *value) {
  if (!value) {
    return;
  }
  wtpdf_document *document = value->document;
  value->object.free();
  delete value;
  release_child(document, sizeof(wtpdf_value));
}

wtpdf_value_kind wtpdf_value_type(const wtpdf_value *value) {
  return value_kind(mutable_object(value));
}

wtpdf_value *wtpdf_value_resolve(const wtpdf_value *value,
                                 wtpdf_status *status) {
  Object *source = mutable_object(value);
  if (!source || !usable_document(value->document)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  Object result;
  source->fetch(value->document->pdf->getXRef(), &result);
  return copy_temporary(value->document, &result, value->depth + 1, status);
}

wtpdf_status wtpdf_value_get_boolean(const wtpdf_value *value, int *result) {
  Object *object = mutable_object(value);
  if (!object || !result) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (!object->isBool()) {
    return WTPDF_STATUS_TYPE_MISMATCH;
  }
  *result = object->getBool() ? 1 : 0;
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_value_get_integer(const wtpdf_value *value,
                                     long long *result) {
  Object *object = mutable_object(value);
  if (!object || !result) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (!object->isInt()) {
    return WTPDF_STATUS_TYPE_MISMATCH;
  }
  *result = object->getInt();
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_value_get_real(const wtpdf_value *value, double *result) {
  Object *object = mutable_object(value);
  if (!object || !result) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (!object->isReal()) {
    return WTPDF_STATUS_TYPE_MISMATCH;
  }
  *result = object->getReal();
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_value_get_string(const wtpdf_value *value,
                                    const unsigned char **bytes,
                                    size_t *size) {
  Object *object = mutable_object(value);
  if (!object || !bytes || !size) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (!object->isString()) {
    return WTPDF_STATUS_TYPE_MISMATCH;
  }
  GString *string = object->getString();
  *bytes = reinterpret_cast<const unsigned char *>(string->getCString());
  *size = static_cast<size_t>(string->getLength());
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_value_get_string_syntax(const wtpdf_value *value,
                                           wtpdf_string_syntax *syntax) {
  Object *object = mutable_object(value);
  if (!object || !syntax) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (!object->isString()) {
    return WTPDF_STATUS_TYPE_MISMATCH;
  }
  *syntax = object->getStringIsHex() ? WTPDF_STRING_HEX
                                    : WTPDF_STRING_LITERAL;
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_value_get_name(const wtpdf_value *value,
                                  const unsigned char **bytes,
                                  size_t *size) {
  Object *object = mutable_object(value);
  if (!object || !bytes || !size) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (!object->isName()) {
    return WTPDF_STATUS_TYPE_MISMATCH;
  }
  const char *name = object->getName();
  *bytes = reinterpret_cast<const unsigned char *>(name);
  *size = std::strlen(name);
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_value_get_reference(const wtpdf_value *value,
                                       int *object_number,
                                       int *generation_number) {
  Object *object = mutable_object(value);
  if (!object || !object_number || !generation_number) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (!object->isRef()) {
    return WTPDF_STATUS_TYPE_MISMATCH;
  }
  Ref reference = object->getRef();
  *object_number = reference.num;
  *generation_number = reference.gen;
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_value_count(const wtpdf_value *value, size_t *count) {
  Object *object = mutable_object(value);
  if (!object || !count) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  if (object->isArray()) {
    *count = static_cast<size_t>(object->arrayGetLength());
    return WTPDF_STATUS_OK;
  }
  if (object->isDict()) {
    *count = static_cast<size_t>(object->dictGetLength());
    return WTPDF_STATUS_OK;
  }
  return WTPDF_STATUS_TYPE_MISMATCH;
}

wtpdf_value *wtpdf_array_get(const wtpdf_value *array,
                             size_t index,
                             wtpdf_lookup_mode mode,
                             wtpdf_status *status) {
  Object *object = mutable_object(array);
  if (!object || !valid_lookup_mode(mode)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  if (!object->isArray()) {
    set_status(status, WTPDF_STATUS_TYPE_MISMATCH);
    return NULL;
  }
  if (index >= static_cast<size_t>(object->arrayGetLength()) ||
      index > static_cast<size_t>(INT_MAX)) {
    set_status(status, WTPDF_STATUS_NOT_FOUND);
    return NULL;
  }
  Object result;
  container_value(object, index, mode, &result);
  return copy_temporary(array->document, &result, array->depth + 1, status);
}

wtpdf_value *wtpdf_dictionary_get(const wtpdf_value *dictionary,
                                  const unsigned char *key,
                                  size_t key_size,
                                  wtpdf_lookup_mode mode,
                                  wtpdf_status *status) {
  Object *object = mutable_object(dictionary);
  if (!object || !key || !valid_lookup_mode(mode) ||
      std::memchr(key, '\0', key_size)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  if (!object->isDict()) {
    set_status(status, WTPDF_STATUS_TYPE_MISMATCH);
    return NULL;
  }
  const int count = object->dictGetLength();
  for (int index = 0; index < count; ++index) {
    const char *candidate = object->dictGetKey(index);
    if (std::strlen(candidate) == key_size &&
        std::memcmp(candidate, key, key_size) == 0) {
      Object result;
      container_value(object, static_cast<size_t>(index), mode, &result);
      return copy_temporary(dictionary->document, &result,
                            dictionary->depth + 1, status);
    }
  }
  set_status(status, WTPDF_STATUS_NOT_FOUND);
  return NULL;
}

wtpdf_value *wtpdf_dictionary_at(const wtpdf_value *dictionary,
                                 size_t index,
                                 const unsigned char **key,
                                 size_t *key_size,
                                 wtpdf_lookup_mode mode,
                                 wtpdf_status *status) {
  Object *object = mutable_object(dictionary);
  if (!object || !key || !key_size || !valid_lookup_mode(mode)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  if (!object->isDict()) {
    set_status(status, WTPDF_STATUS_TYPE_MISMATCH);
    return NULL;
  }
  if (index >= static_cast<size_t>(object->dictGetLength()) ||
      index > static_cast<size_t>(INT_MAX)) {
    set_status(status, WTPDF_STATUS_NOT_FOUND);
    return NULL;
  }
  const char *name = object->dictGetKey(static_cast<int>(index));
  *key = reinterpret_cast<const unsigned char *>(name);
  *key_size = std::strlen(name);
  Object result;
  container_value(object, index, mode, &result);
  return copy_temporary(dictionary->document, &result,
                        dictionary->depth + 1, status);
}

wtpdf_value *wtpdf_stream_dictionary(const wtpdf_value *stream,
                                     wtpdf_status *status) {
  Object *object = mutable_object(stream);
  if (!object) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  if (!object->isStream()) {
    set_status(status, WTPDF_STATUS_TYPE_MISMATCH);
    return NULL;
  }
  Object dictionary;
  dictionary.initDict(object->getStream()->getDict());
  return copy_temporary(stream->document, &dictionary, stream->depth + 1,
                        status);
}

wtpdf_stream_reader *wtpdf_stream_reader_open(const wtpdf_value *stream,
                                              wtpdf_stream_mode mode,
                                              wtpdf_status *status) {
  Object *object = mutable_object(stream);
  if (!object || (mode != WTPDF_STREAM_RAW && mode != WTPDF_STREAM_DECODED)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  if (!object->isStream()) {
    set_status(status, WTPDF_STATUS_TYPE_MISMATCH);
    return NULL;
  }
  wtpdf_stream_reader *reader =
      new (std::nothrow) wtpdf_stream_reader();
  wtpdf_document *document = stream->document;
  if (!reserve_adapter_bytes(document, sizeof(wtpdf_stream_reader))) {
    delete reader;
    set_status(status, WTPDF_STATUS_ALLOCATION_LIMIT);
    return NULL;
  }
  if (!reader) {
    release_adapter_bytes(document, sizeof(wtpdf_stream_reader));
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  reader->document = document;
  reader->max_bytes = mode == WTPDF_STREAM_DECODED
                          ? document->max_decoded_stream_bytes
                          : 0;
  ++document->child_handles;
  Stream *source = mode == WTPDF_STREAM_RAW
                       ? object->getStream()->getUndecodedStream()
                       : object->getStream();
  reader->stream = source ? source->copy() : NULL;
  if (!reader->stream) {
    --document->child_handles;
    release_adapter_bytes(document, sizeof(wtpdf_stream_reader));
    delete reader;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  reader->stream->reset();
  reader->bytes_emitted = 0;
  set_status(status, WTPDF_STATUS_OK);
  return reader;
}

wtpdf_status wtpdf_stream_reader_reset(wtpdf_stream_reader *reader) {
  if (!reader || !reader->stream) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  reader->stream->reset();
  reader->bytes_emitted = 0;
  return WTPDF_STATUS_OK;
}

wtpdf_status wtpdf_stream_reader_read(wtpdf_stream_reader *reader,
                                      unsigned char *buffer,
                                      size_t capacity,
                                      size_t *bytes_read,
                                      int *at_eof) {
  if (!reader || !reader->stream || (!buffer && capacity) || !bytes_read ||
      !at_eof) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  size_t allowed = capacity;
  if (reader->max_bytes) {
    if (reader->bytes_emitted >= reader->max_bytes) {
      *bytes_read = 0;
      *at_eof = reader->stream->lookChar() == EOF ? 1 : 0;
      return *at_eof ? WTPDF_STATUS_OK : WTPDF_STATUS_OUTPUT_TOO_LARGE;
    }
    const size_t remaining = reader->max_bytes - reader->bytes_emitted;
    if (allowed > remaining) {
      allowed = remaining;
    }
  }
  const int request = allowed > static_cast<size_t>(INT_MAX)
                          ? INT_MAX
                          : static_cast<int>(allowed);
  const int count = request
                        ? reader->stream->getBlock(
                              reinterpret_cast<char *>(buffer), request)
                        : 0;
  if (count < 0) {
    return WTPDF_STATUS_INTERNAL_ERROR;
  }
  *bytes_read = static_cast<size_t>(count);
  reader->bytes_emitted += *bytes_read;
  *at_eof = reader->stream->lookChar() == EOF ? 1 : 0;
  return WTPDF_STATUS_OK;
}

void wtpdf_stream_reader_close(wtpdf_stream_reader *reader) {
  if (!reader) {
    return;
  }
  wtpdf_document *document = reader->document;
  if (reader->stream) {
    reader->stream->close();
    delete reader->stream;
    reader->stream = NULL;
  }
  delete reader;
  release_child(document, sizeof(wtpdf_stream_reader));
}

wtpdf_status wtpdf_document_page_box(const wtpdf_document *document,
                                     int page_number,
                                     wtpdf_page_box box,
                                     wtpdf_rectangle *rectangle) {
  if (!rectangle) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  const wtpdf_status state = document_status(document);
  if (state != WTPDF_STATUS_OK) {
    return state;
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
  const wtpdf_status state = document_status(document);
  if (state != WTPDF_STATUS_OK) {
    return state;
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
