use napi::bindgen_prelude::*;
use napi_derive::napi;
use arboard::Clipboard;

#[napi]
pub fn read_clipboard() -> Result<String> {
    let mut clipboard = Clipboard::new().map_err(|e| Error::from_reason(e.to_string()))?;
    clipboard.get_text().map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub fn write_clipboard(text: String) -> Result<()> {
    let mut clipboard = Clipboard::new().map_err(|e| Error::from_reason(e.to_string()))?;
    clipboard.set_text(text).map_err(|e| Error::from_reason(e.to_string()))
}
