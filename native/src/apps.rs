use napi::bindgen_prelude::*;
use napi_derive::napi;
use winreg::enums::*;
use winreg::RegKey;

#[napi(object)]
pub struct InstalledApp {
    pub display_name: String,
    pub install_location: Option<String>,
    pub uninstall_string: Option<String>,
}

#[napi]
pub fn list_installed_apps() -> Result<Vec<InstalledApp>> {
    let mut apps = Vec::new();
    // 枚举 HKLM 和 HKCU 的 Uninstall 键
    Ok(apps)
}

#[napi]
pub fn open_app(path_or_command: String) -> Result<()> {
    std::process::Command::new("cmd")
        .args(&["/C", "start", "", &path_or_command])
        .spawn()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(())
}
