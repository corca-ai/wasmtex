// SPDX-License-Identifier: MIT

#include "wtpdf.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

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

std::string make_fixture() {
  std::string pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  std::vector<size_t> offsets(7, 0);

  const char *objects[] = {
      NULL,
      "<< /Type /Catalog /Pages 2 0 R >>",
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

void check_object_model(wtpdf_document *document, size_t input_size) {
  wtpdf_status status = WTPDF_STATUS_INTERNAL_ERROR;
  require(wtpdf_document_input_size(document) == input_size,
          "input size mismatch");
  require(wtpdf_document_object_count(document) == 7,
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

}  // namespace

int main() {
  require(wtpdf_abi_version() == WTPDF_ABI_VERSION, "ABI version mismatch");
  require(std::string(wtpdf_backend_name()) == "xpdf", "backend name mismatch");
  require(std::string(wtpdf_backend_version()) == "4.04",
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

  std::puts("WTPDF smoke test passed");
  return 0;
}
