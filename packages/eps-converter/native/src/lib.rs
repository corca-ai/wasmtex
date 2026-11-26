use stet_graphics::document_structure::{DocDate, DocInfoRecord, StructuralRecord};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn convert_eps(bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut interpreter = stet::Interpreter::builder()
        .safer()
        .suppress_output()
        .max_page_size(14_400.0)
        .build();
    let context = interpreter.context();
    context.max_local_vm = 64 * 1024 * 1024;
    // A fixed date keeps derived PDFs deterministic and avoids a host clock dependency.
    let mut info = DocInfoRecord::default();
    info.creation_date = Some(DocDate::Raw("D:20000101000000Z".into()));
    context.doc_structure.push(StructuralRecord::DocInfo(info));
    let pdf = interpreter
        .render_to_pdf(bytes, 72.0)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    if interpreter.context().showpage_count != 1 {
        return Err(JsValue::from_str("An EPS figure must produce exactly one page."));
    }
    Ok(pdf)
}
