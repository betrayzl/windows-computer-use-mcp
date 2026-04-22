use napi::bindgen_prelude::*;
use napi_derive::napi;
use win_hotkeys::HotkeyManager;
use win_hotkeys::keys::VKey;
use std::sync::{Arc, Mutex};

#[napi]
pub struct EscapeHotkey {
    manager: Arc<Mutex<HotkeyManager<()>>>,
}

#[napi]
impl EscapeHotkey {
    #[napi(constructor)]
    pub fn new(callback: napi::threadsafe_function::ThreadsafeFunction<(), napi::threadsafe_function::ErrorStrategy::CalleeHandled>) -> Result<Self> {
        let mut manager = HotkeyManager::new();
        let cb = callback.clone();
        manager.register_hotkey(VKey::CustomKeyCode(0x1B), &[], move || {
            // 调用 Node.js 回调
            let _ = cb.call(Ok(()), napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking);
        }).map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(EscapeHotkey { manager: Arc::new(Mutex::new(manager)) })
    }

    #[napi]
    pub fn unregister(&self) -> Result<()> {
        // 清理热键
        Ok(())
    }
}
