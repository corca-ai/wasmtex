// SPDX-License-Identifier: MIT

#include "wtpdf.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#ifndef WTPDF_EXPECTED_BACKEND_VERSION
#define WTPDF_EXPECTED_BACKEND_VERSION "4.04"
#endif

namespace {

void require(bool condition, const char *message) {
  if (!condition) {
    std::fprintf(stderr, "WTPDF smoke test failed: %s\n", message);
    std::exit(1);
  }
}

bool equal(double left, double right) {
  return std::fabs(left - right) < 0.000001;
}

/* Self-generated with pypdf 6.14.2: one blank RC4-128 encrypted page. */
const char kEncryptedFixtureBase64[] =
    "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDc2Y2IyMmMyMmZjZWMy"
    "NWFlM2VkNWQwMjRkNzc3MjhmODNkNTEyNDdhY2Q5Mzc2Y2I5NTZlZmQ3MmY5Mj4KPj4K"
    "ZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCi9LaWRzIFsgNCAw"
    "IFIgXQo+PgplbmRvYmoKMyAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAw"
    "IFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1Jlc291cmNlcyA8PAo+"
    "PgovTWVkaWFCb3ggWyAwLjAgMC4wIDcyIDE0NCBdCi9QYXJlbnQgMiAwIFIKPj4KZW5k"
    "b2JqCjUgMCBvYmoKPDwKL1YgMgovUiAzCi9MZW5ndGggMTI4Ci9QIDQyOTQ5NjcyOTIK"
    "L0ZpbHRlciAvU3RhbmRhcmQKL08gPDBiYTM4MzVmODhmOTAzODhlNzRlNTQ1ODQxMjVj"
    "ZTE0MmJlMGRlMjRjNmIwZDM3NzQ2ZTA3NWI4OTE3NTY2NzE+Ci9VIDw4N2M4ZjNiNWQ5"
    "OWNjMjEwNWVmMjA5ZDYwNWI2ZmYzZDI4YmY0ZTVlNGU3NThhNDE2NDAwNGU1NmZmZmEw"
    "MTA4Pgo+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAw"
    "MDE1IDAwMDAwIG4gCjAwMDAwMDAxMDkgMDAwMDAgbiAKMDAwMDAwMDE2OCAwMDAwMCBu"
    "IAowMDAwMDAwMjE3IDAwMDAwIG4gCjAwMDAwMDAzMTAgMDAwMDAgbiAKdHJhaWxlcgo8"
    "PAovU2l6ZSA2Ci9Sb290IDMgMCBSCi9JbmZvIDEgMCBSCi9JRCBbIDw2NjMxMzAzMTM3"
    "MzUzNDMwMzk2NDM1MzMzOTM4MzEzMjY1MzYzNzYxMzUzMzM0NjM2MzMxMzUzNTMwMzU2"
    "NTM1PiA8NjYzMTMwMzEzNzM1MzQzMDM5NjQzNTMzMzkzODMxMzI2NTM2Mzc2MTM1MzMz"
    "NDYzNjMzMTM1MzUzMDM1NjUzNT4gXQovRW5jcnlwdCA1IDAgUgo+PgpzdGFydHhyZWYK"
    "NTI1CiUlRU9GCg==";

std::string decode_base64(const char *encoded) {
  const std::string alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result;
  unsigned int accumulator = 0;
  int bits = 0;
  for (const char *cursor = encoded; *cursor && *cursor != '='; ++cursor) {
    const size_t value = alphabet.find(*cursor);
    require(value != std::string::npos, "invalid embedded base64 fixture");
    accumulator = (accumulator << 6) | static_cast<unsigned int>(value);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result.push_back(static_cast<char>((accumulator >> bits) & 0xff));
    }
  }
  return result;
}

std::string make_fixture() {
  std::string pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  std::vector<size_t> offsets(7, 0);

  const char *objects[] = {
      NULL,
      "<< /Type /Catalog /Pages 2 0 R /Deep [[[[[1]]]]] >>",
      "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [10 20 210 420] "
      "/CropBox [20 30 200 400] /BleedBox [25 35 195 395] "
      "/TrimBox [30 40 190 390] /ArtBox [35 45 185 385] /Rotate -90 "
      "/TestArray [null true 42 3.5 (A\\000B) <410042> /N#61me 5 0 R] "
      "/TestDict << /First 1 /Second 2 >> /Contents 5 0 R >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 200] "
      "/CropBox [1 2 90 180] >>",
      "<< /Length 11 /Filter /ASCIIHexDecode >>\n"
      "stream\n68656c6c6f>\nendstream",
      "<< /Producer (WasmTex) >>",
  };

  for (size_t index = 1; index < offsets.size(); ++index) {
    offsets[index] = pdf.size();
    char header[32];
    std::snprintf(header, sizeof(header), "%zu 0 obj\n", index);
    pdf += header;
    pdf += objects[index];
    pdf += "\nendobj\n";
  }

  const size_t xref_offset = pdf.size();
  char xref_header[32];
  std::snprintf(xref_header, sizeof(xref_header), "xref\n0 %zu\n",
                offsets.size());
  pdf += xref_header;
  pdf += "0000000000 65535 f \n";
  for (size_t index = 1; index < offsets.size(); ++index) {
    char entry[32];
    std::snprintf(entry, sizeof(entry), "%010zu 00000 n \n", offsets[index]);
    pdf += entry;
  }
  char trailer[128];
  std::snprintf(trailer, sizeof(trailer),
                "trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\n"
                "startxref\n%zu\n%%%%EOF\n",
                xref_offset);
  pdf += trailer;
  return pdf;
}

void append_xref_field(std::string *target, unsigned long value, int width) {
  for (int shift = width - 1; shift >= 0; --shift) {
    target->push_back(static_cast<char>((value >> (shift * 8)) & 0xff));
  }
}

void append_xref_entry(std::string *target,
                       int type,
                       unsigned long field2,
                       unsigned long field3) {
  append_xref_field(target, static_cast<unsigned long>(type), 1);
  append_xref_field(target, field2, 4);
  append_xref_field(target, field3, 2);
}

std::string make_xref_stream_fixture() {
  std::string pdf = "%PDF-1.5\n%\xe2\xe3\xcf\xd3\n";
  size_t offsets[7] = {0};
  const std::string pages =
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  const std::string page =
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] "
      "/Contents 4 0 R >>";
  char header[64];
  std::snprintf(header, sizeof(header), "2 0 3 %zu ", pages.size() + 1);
  const std::string object_stream =
      std::string(header) + pages + " " + page;

  offsets[1] = pdf.size();
  pdf += "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  offsets[4] = pdf.size();
  pdf += "4 0 obj\n<< /Length 5 >>\nstream\nhello\nendstream\nendobj\n";
  offsets[5] = pdf.size();
  char object_stream_header[128];
  std::snprintf(object_stream_header, sizeof(object_stream_header),
                "5 0 obj\n<< /Type /ObjStm /N 2 /First %zu /Length %zu >>\n"
                "stream\n",
                std::strlen(header), object_stream.size());
  pdf += object_stream_header;
  pdf += object_stream;
  pdf += "\nendstream\nendobj\n";
  offsets[6] = pdf.size();

  std::string xref;
  append_xref_entry(&xref, 0, 0, 65535);
  append_xref_entry(&xref, 1, offsets[1], 0);
  append_xref_entry(&xref, 2, 5, 0);
  append_xref_entry(&xref, 2, 5, 1);
  append_xref_entry(&xref, 1, offsets[4], 0);
  append_xref_entry(&xref, 1, offsets[5], 0);
  append_xref_entry(&xref, 1, offsets[6], 0);
  char xref_header[160];
  std::snprintf(xref_header, sizeof(xref_header),
                "6 0 obj\n<< /Type /XRef /Size 7 /Root 1 0 R "
                "/W [1 4 2] /Length %zu >>\nstream\n",
                xref.size());
  pdf += xref_header;
  pdf += xref;
  char trailer[96];
  std::snprintf(trailer, sizeof(trailer),
                "\nendstream\nendobj\nstartxref\n%zu\n%%%%EOF\n", offsets[6]);
  pdf += trailer;
  return pdf;
}

void check_object_model(wtpdf_document *document, size_t input_size) {
  wtpdf_status status = WTPDF_STATUS_INTERNAL_ERROR;
  const size_t baseline_bytes = wtpdf_document_adapter_bytes(document);
  require(wtpdf_document_child_handle_count(document) == 0,
          "document began with live child handles");
  require(wtpdf_document_input_size(document) == input_size,
          "input size mismatch");
  require(wtpdf_document_object_count(document) == 6,
          "object count mismatch");

  wtpdf_value *catalog = wtpdf_document_catalog(document, &status);
  require(catalog && status == WTPDF_STATUS_OK &&
              wtpdf_value_type(catalog) == WTPDF_VALUE_DICTIONARY,
          "catalog query failed");
  wtpdf_value *pages = wtpdf_dictionary_get(
      catalog, reinterpret_cast<const unsigned char *>("Pages"), 5,
      WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(pages && wtpdf_value_type(pages) == WTPDF_VALUE_REFERENCE,
          "catalog Pages reference was resolved unexpectedly");
  int object_number = 0;
  int generation_number = 0;
  require(wtpdf_value_get_reference(pages, &object_number,
                                    &generation_number) == WTPDF_STATUS_OK &&
              object_number == 2 && generation_number == 0,
          "catalog Pages reference identity changed");
  wtpdf_value_destroy(pages);
  wtpdf_value_destroy(catalog);

  wtpdf_value *page_reference = wtpdf_document_page(
      document, 1, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(page_reference &&
              wtpdf_value_get_reference(page_reference, &object_number,
                                        &generation_number) == WTPDF_STATUS_OK &&
              object_number == 3 && generation_number == 0,
          "page reference identity changed");
  wtpdf_value *page = wtpdf_value_resolve(page_reference, &status);
  wtpdf_value_destroy(page_reference);
  require(page && wtpdf_value_type(page) == WTPDF_VALUE_DICTIONARY,
          "page reference did not resolve to a dictionary");

  wtpdf_value *array = wtpdf_dictionary_get(
      page, reinterpret_cast<const unsigned char *>("TestArray"), 9,
      WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  size_t count = 0;
  require(array && wtpdf_value_count(array, &count) == WTPDF_STATUS_OK &&
              count == 8,
          "array length changed");

  wtpdf_value *value = wtpdf_array_get(
      array, 0, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(value && wtpdf_value_type(value) == WTPDF_VALUE_NULL,
          "null array value changed");
  wtpdf_value_destroy(value);

  value = wtpdf_array_get(array, 1, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  int boolean = 0;
  require(value && wtpdf_value_get_boolean(value, &boolean) == WTPDF_STATUS_OK &&
              boolean == 1,
          "boolean array value changed");
  wtpdf_value_destroy(value);

  value = wtpdf_array_get(array, 2, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  long long integer = 0;
  require(value && wtpdf_value_get_integer(value, &integer) == WTPDF_STATUS_OK &&
              integer == 42,
          "integer array value changed");
  double wrong_real = 0;
  require(wtpdf_value_get_real(value, &wrong_real) == WTPDF_STATUS_TYPE_MISMATCH,
          "integer was silently coerced to real");
  wtpdf_value_destroy(value);

  value = wtpdf_array_get(array, 3, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  double real = 0;
  require(value && wtpdf_value_get_real(value, &real) == WTPDF_STATUS_OK &&
              equal(real, 3.5),
          "real array value changed");
  wtpdf_value_destroy(value);

  value = wtpdf_array_get(array, 4, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  const unsigned char *bytes = NULL;
  size_t size = 0;
  require(value && wtpdf_value_get_string(value, &bytes, &size) == WTPDF_STATUS_OK &&
              size == 3 && bytes[0] == 'A' && bytes[1] == 0 && bytes[2] == 'B',
          "binary string bytes changed");
  wtpdf_string_syntax string_syntax = WTPDF_STRING_HEX;
  require(wtpdf_value_get_string_syntax(value, &string_syntax) == WTPDF_STATUS_OK &&
              string_syntax == WTPDF_STRING_LITERAL,
          "literal string syntax changed");
  wtpdf_value_destroy(value);

  value = wtpdf_array_get(array, 5, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(value && wtpdf_value_get_string(value, &bytes, &size) == WTPDF_STATUS_OK &&
              size == 3 && bytes[0] == 'A' && bytes[1] == 0 && bytes[2] == 'B' &&
              wtpdf_value_get_string_syntax(value, &string_syntax) == WTPDF_STATUS_OK &&
              string_syntax == WTPDF_STRING_HEX,
          "hex string syntax or bytes changed");
  wtpdf_value_destroy(value);

  value = wtpdf_array_get(array, 6, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(value && wtpdf_value_get_name(value, &bytes, &size) == WTPDF_STATUS_OK &&
              size == 4 && std::string(reinterpret_cast<const char *>(bytes), size) ==
                               "Name",
          "escaped name decoding changed");
  wtpdf_value_destroy(value);

  value = wtpdf_array_get(array, 7, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(value && wtpdf_value_get_reference(value, &object_number,
                                             &generation_number) == WTPDF_STATUS_OK &&
              object_number == 5 && generation_number == 0,
          "array reference identity changed");
  wtpdf_value *stream = wtpdf_value_resolve(value, &status);
  wtpdf_value_destroy(value);
  require(stream && wtpdf_value_type(stream) == WTPDF_VALUE_STREAM,
          "stream reference did not resolve");

  wtpdf_value *stream_dictionary = wtpdf_stream_dictionary(stream, &status);
  wtpdf_value *length = wtpdf_dictionary_get(
      stream_dictionary, reinterpret_cast<const unsigned char *>("Length"), 6,
      WTPDF_LOOKUP_RESOLVE_REFERENCE, &status);
  require(length && wtpdf_value_get_integer(length, &integer) == WTPDF_STATUS_OK &&
              integer == 11,
          "stream dictionary changed");
  wtpdf_value_destroy(length);
  wtpdf_value_destroy(stream_dictionary);

  for (int mode = WTPDF_STREAM_RAW; mode <= WTPDF_STREAM_DECODED; ++mode) {
    wtpdf_stream_reader *reader = wtpdf_stream_reader_open(
        stream, static_cast<wtpdf_stream_mode>(mode), &status);
    unsigned char buffer[8] = {0};
    size_t bytes_read = 0;
    int at_eof = 0;
    require(reader, "stream reader did not open");
    unsigned char raw_tail[8] = {0};
    size_t tail_read = 0;
    int tail_eof = 0;
    require(wtpdf_stream_reader_read(reader, buffer, sizeof(buffer),
                                     &bytes_read, &at_eof) == WTPDF_STATUS_OK,
            "stream reader failed");
    if (mode == WTPDF_STREAM_RAW) {
      require(bytes_read == sizeof(buffer) && !at_eof &&
                  std::memcmp(buffer, "68656c6c", sizeof(buffer)) == 0,
              "raw stream prefix changed");
      require(wtpdf_stream_reader_read(reader, raw_tail, sizeof(raw_tail),
                                       &tail_read, &tail_eof) == WTPDF_STATUS_OK &&
                  tail_read == 3 && tail_eof &&
                  std::memcmp(raw_tail, "6f>", 3) == 0,
              "raw stream tail changed");
    } else {
      require(bytes_read == 5 && at_eof &&
                  std::memcmp(buffer, "hello", 5) == 0,
              "decoded stream bytes changed");
    }
    require(wtpdf_stream_reader_reset(reader) == WTPDF_STATUS_OK,
            "stream reader reset failed");
    wtpdf_stream_reader_close(reader);
  }
  wtpdf_value_destroy(stream);
  wtpdf_value_destroy(array);

  wtpdf_value *dictionary = wtpdf_dictionary_get(
      page, reinterpret_cast<const unsigned char *>("TestDict"), 8,
      WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(dictionary &&
              wtpdf_value_count(dictionary, &count) == WTPDF_STATUS_OK && count == 2,
          "dictionary length changed");
  const unsigned char *key = NULL;
  size_t key_size = 0;
  value = wtpdf_dictionary_at(dictionary, 0, &key, &key_size,
                              WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(value && key_size == 5 && std::memcmp(key, "First", 5) == 0,
          "dictionary iteration order changed");
  wtpdf_value_destroy(value);
  value = wtpdf_dictionary_at(dictionary, 1, &key, &key_size,
                              WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(value && key_size == 6 && std::memcmp(key, "Second", 6) == 0,
          "dictionary second key changed");
  wtpdf_value_destroy(value);
  wtpdf_value_destroy(dictionary);
  wtpdf_value_destroy(page);

  wtpdf_value *info = wtpdf_document_info(document, &status);
  require(info && wtpdf_value_type(info) == WTPDF_VALUE_DICTIONARY,
          "Info dictionary query failed");
  value = wtpdf_dictionary_get(
      info, reinterpret_cast<const unsigned char *>("Producer"), 8,
      WTPDF_LOOKUP_RESOLVE_REFERENCE, &status);
  require(value && wtpdf_value_get_string(value, &bytes, &size) == WTPDF_STATUS_OK &&
              std::string(reinterpret_cast<const char *>(bytes), size) == "WasmTex",
          "Info string changed");
  wtpdf_value_destroy(value);
  wtpdf_value_destroy(info);

  wtpdf_value *trailer = wtpdf_document_trailer(document, &status);
  require(trailer && wtpdf_value_type(trailer) == WTPDF_VALUE_DICTIONARY,
          "trailer query failed");
  wtpdf_value_destroy(trailer);

  stream = wtpdf_document_object(document, 5, 0, &status);
  require(stream && wtpdf_value_type(stream) == WTPDF_VALUE_STREAM,
          "indirect object lookup failed");
  wtpdf_value_destroy(stream);
  require(!wtpdf_document_object(document, 99, 0, &status) &&
              status == WTPDF_STATUS_NOT_FOUND,
          "missing indirect object did not report not-found");
  require(wtpdf_document_child_handle_count(document) == 0,
          "value or reader handle leaked");
  require(wtpdf_document_adapter_bytes(document) == baseline_bytes,
          "adapter-owned handle bytes leaked");
}

void check_document(wtpdf_document *document, size_t input_size) {
  require(document != NULL, "document did not open");
  require(wtpdf_document_page_count(document) == 2, "page count mismatch");
  require(equal(wtpdf_document_pdf_version(document), 1.7),
          "PDF version mismatch");
  require(!wtpdf_document_is_encrypted(document),
          "unencrypted fixture reported as encrypted");

  wtpdf_rectangle rectangle;
  require(wtpdf_document_page_box(document, 1, WTPDF_PAGE_BOX_MEDIA,
                                  &rectangle) == WTPDF_STATUS_OK,
          "MediaBox query failed");
  require(equal(rectangle.x1, 10) && equal(rectangle.y1, 20) &&
              equal(rectangle.x2, 210) && equal(rectangle.y2, 420),
          "MediaBox values changed");

  require(wtpdf_document_page_box(document, 1, WTPDF_PAGE_BOX_ART,
                                  &rectangle) == WTPDF_STATUS_OK,
          "ArtBox query failed");
  require(equal(rectangle.x1, 35) && equal(rectangle.y1, 45) &&
              equal(rectangle.x2, 185) && equal(rectangle.y2, 385),
          "ArtBox values changed");

  require(wtpdf_document_page_box(document, 2, WTPDF_PAGE_BOX_BLEED,
                                  &rectangle) == WTPDF_STATUS_OK,
          "BleedBox fallback query failed");
  require(equal(rectangle.x1, 1) && equal(rectangle.y1, 2) &&
              equal(rectangle.x2, 90) && equal(rectangle.y2, 180),
          "BleedBox did not fall back to CropBox");

  int rotation = 0;
  require(wtpdf_document_page_rotation(document, 1, &rotation) ==
              WTPDF_STATUS_OK &&
              rotation == 270,
          "negative rotation was not normalized");
  require(wtpdf_document_page_rotation(document, 3, &rotation) ==
              WTPDF_STATUS_BAD_PAGE,
          "out-of-range page did not fail");

  check_object_model(document, input_size);
}

void check_xref_and_object_streams() {
  const std::string fixture = make_xref_stream_fixture();
  wtpdf_status status = WTPDF_STATUS_INTERNAL_ERROR;
  wtpdf_document *document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(fixture.data()), fixture.size(),
      NULL, &status);
  require(document && status == WTPDF_STATUS_OK,
          "xref-stream fixture did not open");
  require(wtpdf_document_page_count(document) == 1,
          "compressed page tree was not read");
  wtpdf_value *pages = wtpdf_document_object(document, 2, 0, &status);
  require(pages && wtpdf_value_type(pages) == WTPDF_VALUE_DICTIONARY,
          "object-stream member lookup failed");
  wtpdf_value_destroy(pages);
  wtpdf_value *stream = wtpdf_document_object(document, 4, 0, &status);
  require(stream && wtpdf_value_type(stream) == WTPDF_VALUE_STREAM,
          "xref-stream content lookup failed");
  wtpdf_stream_reader *reader = wtpdf_stream_reader_open(
      stream, WTPDF_STREAM_DECODED, &status);
  unsigned char bytes[8] = {0};
  size_t count = 0;
  int eof = 0;
  require(reader &&
              wtpdf_stream_reader_read(reader, bytes, sizeof(bytes), &count,
                                       &eof) == WTPDF_STATUS_OK &&
              count == 5 && eof && std::memcmp(bytes, "hello", 5) == 0,
          "xref-stream decoded content changed");
  wtpdf_stream_reader_close(reader);
  wtpdf_value_destroy(stream);
  wtpdf_value *info = wtpdf_document_info(document, &status);
  require(info == NULL && status == WTPDF_STATUS_NOT_FOUND,
          "absent Info dictionary must report NOT_FOUND, not a null value");
  require(wtpdf_document_child_handle_count(document) == 0,
          "xref-stream handles leaked");
  wtpdf_document_close(document);
}

void check_resource_limits(const std::string &classic_fixture) {
  wtpdf_open_options options;
  wtpdf_open_options_init(&options);
  require(options.max_input_bytes == WTPDF_DEFAULT_MAX_INPUT_BYTES &&
              options.max_object_depth == WTPDF_DEFAULT_MAX_OBJECT_DEPTH &&
              options.max_decoded_stream_bytes ==
                  WTPDF_DEFAULT_MAX_DECODED_STREAM_BYTES &&
              options.max_adapter_bytes == WTPDF_DEFAULT_MAX_ADAPTER_BYTES,
          "production resource defaults are not finite and stable");

  wtpdf_status status = WTPDF_STATUS_INTERNAL_ERROR;
  options.max_adapter_bytes = 1;
  wtpdf_document *document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(classic_fixture.data()),
      classic_fixture.size(), &options, &status);
  require(!document && status == WTPDF_STATUS_ALLOCATION_LIMIT,
          "aggregate adapter allocation limit was not enforced");

  wtpdf_open_options_init(&options);
  options.max_object_depth = 4;
  document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(classic_fixture.data()),
      classic_fixture.size(), &options, &status);
  require(document && status == WTPDF_STATUS_OK,
          "depth-limit fixture did not open");
  wtpdf_value *value = wtpdf_document_catalog(document, &status);
  require(value, "depth-limit catalog lookup failed");
  wtpdf_value *next = wtpdf_dictionary_get(
      value, reinterpret_cast<const unsigned char *>("Deep"), 4,
      WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  wtpdf_value_destroy(value);
  value = next;
  for (int depth = 0; depth < 2; ++depth) {
    next = wtpdf_array_get(value, 0, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
    require(next && status == WTPDF_STATUS_OK,
            "object traversal reached the depth limit too early");
    wtpdf_value_destroy(value);
    value = next;
  }
  next = wtpdf_array_get(value, 0, WTPDF_LOOKUP_PRESERVE_REFERENCE, &status);
  require(!next && status == WTPDF_STATUS_DEPTH_LIMIT,
          "object traversal depth limit was not enforced");
  wtpdf_value_destroy(value);
  wtpdf_document_close(document);

  const std::string stream_fixture = make_xref_stream_fixture();
  wtpdf_open_options_init(&options);
  options.max_decoded_stream_bytes = 4;
  document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(stream_fixture.data()),
      stream_fixture.size(), &options, &status);
  require(document && status == WTPDF_STATUS_OK,
          "stream-limit fixture did not open");
  value = wtpdf_document_object(document, 4, 0, &status);
  wtpdf_stream_reader *reader =
      wtpdf_stream_reader_open(value, WTPDF_STREAM_DECODED, &status);
  unsigned char bytes[8] = {0};
  size_t count = 0;
  int eof = 0;
  require(reader &&
              wtpdf_stream_reader_read(reader, bytes, sizeof(bytes), &count,
                                       &eof) == WTPDF_STATUS_OK &&
              count == 4 && !eof,
          "decoded stream limit did not permit its exact budget");
  require(wtpdf_stream_reader_read(reader, bytes, sizeof(bytes), &count,
                                   &eof) == WTPDF_STATUS_OUTPUT_TOO_LARGE,
          "decoded stream limit did not reject excess output");
  wtpdf_stream_reader_close(reader);
  wtpdf_value_destroy(value);
  wtpdf_document_close(document);

  const std::string malformed = "%PDF-1.7\nthis is not a PDF\n%%EOF\n";
  document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(malformed.data()),
      malformed.size(), NULL, &status);
  require(!document && status != WTPDF_STATUS_OK,
          "malformed input unexpectedly opened");
}

void check_encryption() {
  const std::string fixture = decode_base64(kEncryptedFixtureBase64);
  wtpdf_status status = WTPDF_STATUS_INTERNAL_ERROR;
  wtpdf_document *document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(fixture.data()), fixture.size(),
      NULL, &status);
  require(document && status == WTPDF_STATUS_ENCRYPTED &&
              wtpdf_document_is_encrypted(document) &&
              wtpdf_document_is_locked(document) &&
              wtpdf_document_page_count(document) == 0,
          "encrypted input was not returned as a locked document");
  require(!wtpdf_document_catalog(document, &status) &&
              status == WTPDF_STATUS_LOCKED,
          "locked document query did not fail explicitly");
  require(wtpdf_document_authenticate(document, NULL, "wrong") ==
              WTPDF_STATUS_ENCRYPTED &&
              wtpdf_document_is_locked(document),
          "wrong password did not leave the document locked");
  require(wtpdf_document_authenticate(document, NULL, "user") ==
              WTPDF_STATUS_OK &&
              !wtpdf_document_is_locked(document) &&
              wtpdf_document_page_count(document) == 1,
          "user password did not unlock the document");
  wtpdf_value *catalog = wtpdf_document_catalog(document, &status);
  require(catalog &&
              wtpdf_document_authenticate(document, NULL, "user") ==
                  WTPDF_STATUS_BUSY,
          "authentication with a live child handle was not rejected");
  wtpdf_value_destroy(catalog);
  wtpdf_document_close(document);

  document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(fixture.data()), fixture.size(),
      NULL, &status);
  require(document && status == WTPDF_STATUS_ENCRYPTED &&
              wtpdf_document_authenticate(document, "owner", NULL) ==
                  WTPDF_STATUS_OK &&
              wtpdf_document_page_count(document) == 1,
          "owner password did not unlock the document");
  wtpdf_document_close(document);
}

}  // namespace

int main() {
  require(wtpdf_abi_version() == WTPDF_ABI_VERSION, "ABI version mismatch");
  require(std::string(wtpdf_backend_name()) == "xpdf", "backend name mismatch");
  require(std::string(wtpdf_backend_version()) == WTPDF_EXPECTED_BACKEND_VERSION,
          "backend version mismatch");

  const std::string original = make_fixture();
  std::string memory_input = original;
  wtpdf_status status = WTPDF_STATUS_INTERNAL_ERROR;
  wtpdf_open_options options;
  wtpdf_open_options_init(&options);
  options.max_input_bytes = memory_input.size();
  wtpdf_document *document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(memory_input.data()),
      memory_input.size(), &options, &status);
  require(status == WTPDF_STATUS_OK, "memory open returned an error");
  memory_input.assign(memory_input.size(), 'x');
  check_document(document, original.size());
  wtpdf_document_close(document);

  options.max_input_bytes = original.size() - 1;
  document = wtpdf_document_open_memory(
      reinterpret_cast<const unsigned char *>(original.data()), original.size(),
      &options, &status);
  require(!document && status == WTPDF_STATUS_INPUT_TOO_LARGE,
          "memory input limit was not enforced");

  const char *path = "/wtpdf-smoke.pdf";
  FILE *file = std::fopen(path, "wb");
  require(file != NULL, "could not create file fixture");
  require(std::fwrite(original.data(), 1, original.size(), file) ==
              original.size(),
          "could not write file fixture");
  require(std::fclose(file) == 0, "could not close file fixture");

  options.max_input_bytes = original.size();
  document = wtpdf_document_open_file(path, &options, &status);
  require(status == WTPDF_STATUS_OK, "file open returned an error");
  check_document(document, original.size());
  wtpdf_document_close(document);

  options.max_input_bytes = original.size() - 1;
  document = wtpdf_document_open_file(path, &options, &status);
  require(!document && status == WTPDF_STATUS_INPUT_TOO_LARGE,
          "file input limit was not enforced");
  std::remove(path);

  check_xref_and_object_streams();
  check_resource_limits(original);
  check_encryption();

  std::puts("WTPDF smoke test passed");
  return 0;
}
