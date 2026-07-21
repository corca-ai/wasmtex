// SPDX-License-Identifier: MIT

#include "wtpdf.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
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
  std::vector<size_t> offsets(5, 0);

  const char *objects[] = {
      NULL,
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [10 20 210 420] "
      "/CropBox [20 30 200 400] /BleedBox [25 35 195 395] "
      "/TrimBox [30 40 190 390] /ArtBox [35 45 185 385] /Rotate -90 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 200] "
      "/CropBox [1 2 90 180] >>",
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
  pdf += "xref\n0 5\n0000000000 65535 f \n";
  for (size_t index = 1; index < offsets.size(); ++index) {
    char entry[32];
    std::snprintf(entry, sizeof(entry), "%010zu 00000 n \n", offsets[index]);
    pdf += entry;
  }
  char trailer[128];
  std::snprintf(trailer, sizeof(trailer),
                "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n%zu\n%%%%EOF\n",
                xref_offset);
  pdf += trailer;
  return pdf;
}

void check_document(wtpdf_document *document) {
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
}

}  // namespace

int main() {
  require(wtpdf_abi_version() == WTPDF_ABI_VERSION, "ABI version mismatch");
  require(std::string(wtpdf_backend_name()) == "xpdf", "backend name mismatch");

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
  check_document(document);
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
  check_document(document);
  wtpdf_document_close(document);

  options.max_input_bytes = original.size() - 1;
  document = wtpdf_document_open_file(path, &options, &status);
  require(!document && status == WTPDF_STATUS_INPUT_TOO_LARGE,
          "file input limit was not enforced");
  std::remove(path);

  std::puts("WTPDF smoke test passed");
  return 0;
}
