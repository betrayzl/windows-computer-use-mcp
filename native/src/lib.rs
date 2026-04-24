use napi_derive::napi;

mod capture;
mod window;
mod input;
mod hotkey;
mod clipboard;
mod apps;
mod uia;

pub use capture::*;
pub use window::*;
pub use input::*;
pub use hotkey::*;
pub use clipboard::*;
pub use apps::*;
pub use uia::*;

// ========== 临时诊断代码，验证完成后可删除 ==========
use napi::bindgen_prelude::*;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::HiDpi::*;
use std::sync::Mutex;

#[napi(object)]
#[derive(Clone)]
pub struct DebugMonitorInfo {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

lazy_static::lazy_static! {
    static ref DEBUG_MONITORS: Mutex<Vec<DebugMonitorInfo>> = Mutex::new(Vec::new());
}

unsafe extern "system" fn debug_monitor_enum_proc(
    hmon: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    _lparam: LPARAM,
) -> windows::core::BOOL {
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if GetMonitorInfoW(hmon, &mut info as *mut _ as *mut _).as_bool() {
        let rect = info.monitorInfo.rcMonitor;
        let is_primary = (info.monitorInfo.dwFlags & 1) != 0; // MONITORINFOF_PRIMARY = 1

        let mut dpi_x = 0u32;
        let mut dpi_y = 0u32;
        GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y).ok();
        let scale = if dpi_x == 0 { 1.0 } else { dpi_x as f64 / 96.0 };

        if let Ok(mut monitors) = DEBUG_MONITORS.lock() {
            monitors.push(DebugMonitorInfo {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                scale_factor: scale,
                is_primary,
            });
        }
    }
    windows::core::BOOL(1)
}

#[napi]
pub fn get_debug_monitor_info() -> Result<Vec<DebugMonitorInfo>> {
    unsafe {
        DEBUG_MONITORS.lock().unwrap().clear();
        EnumDisplayMonitors(None, None, Some(debug_monitor_enum_proc), LPARAM(0));
        Ok(DEBUG_MONITORS.lock().unwrap().clone())
    }
}