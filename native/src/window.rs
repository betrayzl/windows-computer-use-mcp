use napi::bindgen_prelude::*;
use napi_derive::napi;
use napi::Error;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::System::Threading::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::Win32::UI::HiDpi::*;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    KEYBD_EVENT_FLAGS, VK_TAB, VK_MENU,
};
use enigo::*;
use windows::core::PWSTR;
use std::sync::Mutex;
use lazy_static::lazy_static;
use std::thread;
use std::time::Duration;

lazy_static! {
    static ref MONITOR_NAMES: Mutex<Vec<String>> = Mutex::new(Vec::new());
}

#[napi(object)]
pub struct DisplayGeometry {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[napi(object)]
pub struct FrontmostApp {
    pub title: String,
    pub process_path: String,
}

#[napi(object)]
pub struct RegionRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[napi]
pub struct WindowManager;

#[napi]
impl WindowManager {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        Ok(WindowManager)
    }

    #[napi]
    pub fn get_display_size(&self) -> Result<DisplayGeometry> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| Error::from_reason(format!("Enigo init: {}", e)))?;
        let (_, _) = enigo.main_display()
            .map_err(|e| Error::from_reason(format!("main_display: {}", e)))?;

        unsafe {
            let hmonitor = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
            if hmonitor.0.is_null() {
                return Err(Error::from_reason("Failed to get primary monitor"));
            }

            let mut monitor_info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };

            if GetMonitorInfoW(hmonitor, &mut monitor_info).as_bool() {
                let rect = monitor_info.rcMonitor;
                let left = rect.left;
                let top = rect.top;
                let width = (rect.right - rect.left) as u32;
                let height = (rect.bottom - rect.top) as u32;

                let mut dpi_x = 0u32;
                let mut dpi_y = 0u32;
                let scale = if GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y).is_ok() {
                    dpi_x as f64 / 96.0
                } else {
                    1.0
                };

                Ok(DisplayGeometry {
                    left,
                    top,
                    width,
                    height,
                    scale_factor: scale,
                })
            } else {
                Err(Error::from_reason("GetMonitorInfoW failed"))
            }
        }
    }

    #[napi]
    pub fn hide_windows(&self, process_names: Vec<String>) -> Vec<i32> {
        let mut window_pids: Vec<(HWND, u32)> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(enum_windows_collect_proc), LPARAM(&mut window_pids as *mut _ as isize));
        }

        let lower_names: Vec<String> = process_names.iter().map(|n| n.to_lowercase()).collect();
        let mut hidden = Vec::new();

        for (hwnd, pid) in window_pids {
            if let Some(name) = unsafe { get_process_name(pid) } {
                let lower = name.to_lowercase();
                for n in &lower_names {
                    if lower.contains(n) {
                        unsafe {
                            let _ = ShowWindow(hwnd, SW_HIDE);
                            hidden.push(hwnd.0 as i32);
                        }
                        break;
                    }
                }
            }
        }
        hidden
    }

    #[napi]
    pub fn unhide_windows(&self, handles: Vec<i32>) {
        for hwnd in handles {
            unsafe {
                let _ = ShowWindow(HWND(hwnd as isize as *mut _), SW_RESTORE);
            }
        }
    }

    #[napi]
    pub fn get_foreground_app(&self) -> Result<FrontmostApp> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0 == std::ptr::null_mut() {
                return Err(Error::from_reason("No foreground window"));
            }
            let mut title = [0u16; 256];
            GetWindowTextW(hwnd, &mut title);
            let title = String::from_utf16_lossy(&title).trim_end_matches('\0').to_string();

            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let path = get_process_path(pid).unwrap_or_default();

            Ok(FrontmostApp { title, process_path: path })
        }
    }

    #[napi]
    pub fn enum_monitors(&self) -> Result<Vec<String>> {
        unsafe {
            MONITOR_NAMES.lock().unwrap().clear();
            let result = EnumDisplayMonitors(None, None, Some(monitor_enum_proc), LPARAM(0));
            if result.as_bool() {
                let names = MONITOR_NAMES.lock().unwrap().clone();
                Ok(names)
            } else {
                Err(Error::from_reason("EnumDisplayMonitors failed"))
            }
        }
    }

    #[napi]
    pub fn focus_window(&self, process_name: String) -> Result<bool> {
        let mut target_hwnd: Option<HWND> = None;
        let lower_name = process_name.to_lowercase();

        unsafe {
            let mut context = (&mut target_hwnd, &lower_name);
            let _ = EnumWindows(Some(enum_windows_find_proc), LPARAM(&mut context as *mut _ as isize));
        }

        if let Some(hwnd) = target_hwnd {
            unsafe {
                if IsIconic(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                }
                let _ = ShowWindow(hwnd, SW_SHOW);
                thread::sleep(Duration::from_millis(80));

                // Method 1: AllowSetForegroundWindow + SetForegroundWindow + BringWindowToTop
                let _ = AllowSetForegroundWindow(u32::MAX);
                let _ = SetForegroundWindow(hwnd);
                let _ = BringWindowToTop(hwnd);
                thread::sleep(Duration::from_millis(150));
                if GetForegroundWindow() == hwnd {
                    return Ok(true);
                }

                let current_thread_id = GetCurrentThreadId();
                let mut target_thread_id = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut target_thread_id));

                // Method 2: AttachThreadInput + SetForegroundWindow
                if target_thread_id != 0 && current_thread_id != target_thread_id {
                    let _ = AllowSetForegroundWindow(target_thread_id);
                    let _ = AttachThreadInput(current_thread_id, target_thread_id, true);
                    thread::sleep(Duration::from_millis(50));
                    let _ = SetForegroundWindow(hwnd);
                    let _ = BringWindowToTop(hwnd);
                    thread::sleep(Duration::from_millis(150));
                    let _ = AttachThreadInput(current_thread_id, target_thread_id, false);
                    if GetForegroundWindow() == hwnd {
                        return Ok(true);
                    }
                }

                // Method 3: SetWindowPos to promote target in Z-order before retry
                let _ = SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                thread::sleep(Duration::from_millis(50));

                // Method 4: UI Automation SetFocus (works across integrity levels for focus-but-not-foreground)
                println!("[WARN] Trying UIA SetFocus for {:?}", hwnd);
                let _ = crate::uia::focus_window_uia(hwnd);
                thread::sleep(Duration::from_millis(200));
                if GetForegroundWindow() == hwnd {
                    return Ok(true);
                }

                // Method 5: Minimize the current foreground window via UIA WindowPattern
                // (works across UIPI where ShowWindow/SendInput fail)
                let blocking_fg = GetForegroundWindow();
                if blocking_fg != hwnd && blocking_fg.0 != std::ptr::null_mut() {
                    println!("[WARN] Minimizing blocking window {:?} via UIA to unblock focus", blocking_fg);
                    let minimized = crate::uia::minimize_window_uia(blocking_fg);
                    if minimized {
                        println!("[WARN] Blocking window minimized via UIA, retrying focus...");
                    } else {
                        println!("[WARN] UIA minimize failed, trying ShowWindow...");
                        let _ = ShowWindow(blocking_fg, SW_MINIMIZE);
                    }
                    thread::sleep(Duration::from_millis(500));

                    // Retry focus after minimizing the blocker
                    let _ = AllowSetForegroundWindow(u32::MAX);
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = SetForegroundWindow(hwnd);
                    let _ = BringWindowToTop(hwnd);
                    thread::sleep(Duration::from_millis(200));
                    if GetForegroundWindow() == hwnd {
                        return Ok(true);
                    }

                    // Try one more Alt+Tab in case the minimize changed the ordering
                    simulate_alt_tab();
                    thread::sleep(Duration::from_millis(300));
                    if GetForegroundWindow() == hwnd {
                        return Ok(true);
                    }
                }

                // Method 6: Final attempt — set window pos to top with show flag
                let _ = SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                thread::sleep(Duration::from_millis(100));

                Ok(GetForegroundWindow() == hwnd)
            }
        } else {
            Ok(false)
        }
    }

    #[napi]
    pub fn is_process_running(&self, process_name: String) -> bool {
        let lower_target = process_name.to_lowercase();
        let mut found = false;

        unsafe {
            struct SearchContext<'a> {
                target: &'a str,
                found: &'a mut bool,
            }

            extern "system" fn search_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
                let context = unsafe { &mut *(lparam.0 as *mut SearchContext) };

                let visible = unsafe { IsWindowVisible(hwnd).as_bool() };
                if visible {
                    let mut pid = 0u32;
                    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
                    if pid != 0 {
                        let name = unsafe { get_process_name(pid) };
                        if let Some(name) = name {
                            if name.to_lowercase().contains(context.target) {
                                *context.found = true;
                                return windows::core::BOOL(0);
                            }
                        }
                    }
                }
                windows::core::BOOL(1)
            }

            let mut context = SearchContext {
                target: &lower_target,
                found: &mut found,
            };

            let _ = EnumWindows(Some(search_proc), LPARAM(&mut context as *mut _ as isize));
        }

        found
    }

    #[napi]
    pub fn get_window_rect(&self, process_name: String) -> Result<Option<RegionRect>> {
        let mut target_hwnd: Option<HWND> = None;
        let lower_name = process_name.to_lowercase();

        unsafe {
            let mut context = (&mut target_hwnd, &lower_name);
            let _ = EnumWindows(Some(enum_windows_find_proc), LPARAM(&mut context as *mut _ as isize));
        }

        if let Some(hwnd) = target_hwnd {
            unsafe {
                let mut rect = RECT::default();
                if GetWindowRect(hwnd, &mut rect).is_ok() {
                    Ok(Some(RegionRect {
                        x: rect.left,
                        y: rect.top,
                        width: rect.right - rect.left,
                        height: rect.bottom - rect.top,
                    }))
                } else {
                    Ok(None)
                }
            }
        } else {
            Ok(None)
        }
    }
}

// ========== Alt+Tab 模拟实现 ==========
unsafe fn simulate_alt_tab() {
    let inputs: [INPUT; 4] = [
        // Alt down
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(VK_MENU.0 as u16),
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        // Tab down
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(VK_TAB.0 as u16),
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        // Tab up
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(VK_TAB.0 as u16),
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP.0 as u32),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        // Alt up
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(VK_MENU.0 as u16),
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP.0 as u32),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
    ];

    for input in inputs.iter() {
        let _ = SendInput(&[*input], std::mem::size_of::<INPUT>() as i32);
        thread::sleep(Duration::from_millis(50));
    }
}

// ========== 回调与工具函数 ==========

unsafe extern "system" fn monitor_enum_proc(
    hmon: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    _param: LPARAM,
) -> windows::core::BOOL {
    if hmon.is_invalid() {
        return windows::core::BOOL(1);
    }
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if GetMonitorInfoW(hmon, &mut info as *mut _ as *mut _).as_bool() {
        let name = String::from_utf16_lossy(&info.szDevice);
        if let Ok(mut names) = MONITOR_NAMES.lock() {
            names.push(name);
        }
    }
    windows::core::BOOL(1)
}

unsafe extern "system" fn enum_windows_collect_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    let window_pids = &mut *(lparam.0 as *mut Vec<(HWND, u32)>);
    if !IsWindowVisible(hwnd).as_bool() {
        return windows::core::BOOL(1);
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid != 0 {
        window_pids.push((hwnd, pid));
    }
    windows::core::BOOL(1)
}

unsafe extern "system" fn enum_windows_find_proc(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    let context = &mut *(lparam.0 as *mut (&mut Option<HWND>, &String));
    let (target_hwnd, lower_name) = context;

    if !IsWindowVisible(hwnd).as_bool() {
        return windows::core::BOOL(1);
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return windows::core::BOOL(1);
    }
    if let Some(name) = get_process_name(pid) {
        if name.to_lowercase().contains(lower_name.as_str()) {
            **target_hwnd = Some(hwnd);
            return windows::core::BOOL(0);
        }
    }
    windows::core::BOOL(1)
}

unsafe fn get_process_name(pid: u32) -> Option<String> {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buf = [0u16; 260];
    let mut size = buf.len() as u32;
    let result = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_FORMAT(0),
        PWSTR(buf.as_mut_ptr()),
        &mut size,
    );
    let _ = CloseHandle(handle);
    if result.is_ok() {
        let path = OsString::from_wide(&buf[..size as usize]);
        path.to_str()
            .and_then(|s| s.split('\\').last())
            .map(|s| s.to_string())
    } else {
        None
    }
}

unsafe fn get_process_path(pid: u32) -> Option<String> {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buf = [0u16; 260];
    let mut size = buf.len() as u32;
    let result = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_FORMAT(0),
        PWSTR(buf.as_mut_ptr()),
        &mut size,
    );
    let _ = CloseHandle(handle);
    if result.is_ok() {
        Some(String::from_utf16_lossy(&buf[..size as usize]))
    } else {
        None
    }
}