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
  PDFDoc *pdf;

  wtpdf_document() : input(NULL), input_size(0), pdf(NULL) {}
};

struct wtpdf_value {
  const wtpdf_document *document;
  Object object;

  explicit wtpdf_value(const wtpdf_document *document_in)
      : document(document_in), object() {}
};

struct wtpdf_stream_reader {
  Stream *stream;

  wtpdf_stream_reader() : stream(NULL) {}
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

bool usable_document(const wtpdf_document *document) {
  return document && document->pdf && document->pdf->isOk() &&
         document->pdf->getXRef();
}

bool valid_lookup_mode(wtpdf_lookup_mode mode) {
  return mode == WTPDF_LOOKUP_PRESERVE_REFERENCE ||
         mode == WTPDF_LOOKUP_RESOLVE_REFERENCE;
}

wtpdf_value *copy_value(const wtpdf_document *document,
                        Object *object,
                        wtpdf_status *status) {
  if (!document || !object || object->isError() || object->isEOF() ||
      object->isNone()) {
    set_status(status, WTPDF_STATUS_INTERNAL_ERROR);
    return NULL;
  }
  wtpdf_value *value = new (std::nothrow) wtpdf_value(document);
  if (!value) {
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  object->copy(&value->object);
  set_status(status, WTPDF_STATUS_OK);
  return value;
}

wtpdf_value *copy_temporary(const wtpdf_document *document,
                            Object *object,
                            wtpdf_status *status) {
  wtpdf_value *value = copy_value(document, object, status);
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
  GString *filename = new (std::nothrow) GString(path);
  if (!document || !filename) {
    delete document;
    delete filename;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  if (have_input_size) {
    document->input_size = static_cast<size_t>(input_stat.st_size);
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

size_t wtpdf_document_input_size(const wtpdf_document *document) {
  return document ? document->input_size : 0;
}

int wtpdf_document_object_count(const wtpdf_document *document) {
  return usable_document(document)
             ? document->pdf->getXRef()->getNumObjects()
             : 0;
}

wtpdf_value *wtpdf_document_catalog(const wtpdf_document *document,
                                    wtpdf_status *status) {
  if (!usable_document(document)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  Object object;
  document->pdf->getXRef()->getCatalog(&object);
  return copy_temporary(document, &object, status);
}

wtpdf_value *wtpdf_document_trailer(const wtpdf_document *document,
                                    wtpdf_status *status) {
  if (!usable_document(document)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  return copy_value(document, document->pdf->getXRef()->getTrailerDict(),
                    status);
}

wtpdf_value *wtpdf_document_info(const wtpdf_document *document,
                                 wtpdf_status *status) {
  if (!usable_document(document)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
    return NULL;
  }
  Object object;
  document->pdf->getDocInfo(&object);
  return copy_temporary(document, &object, status);
}

wtpdf_value *wtpdf_document_page(const wtpdf_document *document,
                                 int page_number,
                                 wtpdf_lookup_mode mode,
                                 wtpdf_status *status) {
  if (!usable_document(document) || !valid_lookup_mode(mode)) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
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
    return copy_temporary(document, &resolved, status);
  }
  return copy_temporary(document, &object, status);
}

wtpdf_value *wtpdf_document_object(const wtpdf_document *document,
                                   int object_number,
                                   int generation_number,
                                   wtpdf_status *status) {
  if (!usable_document(document) || object_number < 0 ||
      generation_number < 0) {
    set_status(status, WTPDF_STATUS_INVALID_ARGUMENT);
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
  return copy_temporary(document, &object, status);
}

void wtpdf_value_destroy(wtpdf_value *value) {
  if (!value) {
    return;
  }
  value->object.free();
  delete value;
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
  return copy_temporary(value->document, &result, status);
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
  return copy_temporary(array->document, &result, status);
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
      return copy_temporary(dictionary->document, &result, status);
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
  return copy_temporary(dictionary->document, &result, status);
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
  return copy_temporary(stream->document, &dictionary, status);
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
  if (!reader) {
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  Stream *source = mode == WTPDF_STREAM_RAW
                       ? object->getStream()->getUndecodedStream()
                       : object->getStream();
  reader->stream = source ? source->copy() : NULL;
  if (!reader->stream) {
    delete reader;
    set_status(status, WTPDF_STATUS_OUT_OF_MEMORY);
    return NULL;
  }
  reader->stream->reset();
  set_status(status, WTPDF_STATUS_OK);
  return reader;
}

wtpdf_status wtpdf_stream_reader_reset(wtpdf_stream_reader *reader) {
  if (!reader || !reader->stream) {
    return WTPDF_STATUS_INVALID_ARGUMENT;
  }
  reader->stream->reset();
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
  const int request = capacity > static_cast<size_t>(INT_MAX)
                          ? INT_MAX
                          : static_cast<int>(capacity);
  const int count = request
                        ? reader->stream->getBlock(
                              reinterpret_cast<char *>(buffer), request)
                        : 0;
  if (count < 0) {
    return WTPDF_STATUS_INTERNAL_ERROR;
  }
  *bytes_read = static_cast<size_t>(count);
  *at_eof = reader->stream->lookChar() == EOF ? 1 : 0;
  return WTPDF_STATUS_OK;
}

void wtpdf_stream_reader_close(wtpdf_stream_reader *reader) {
  if (!reader) {
    return;
  }
  if (reader->stream) {
    reader->stream->close();
    delete reader->stream;
    reader->stream = NULL;
  }
  delete reader;
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
