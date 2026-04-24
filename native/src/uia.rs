use napi::bindgen_prelude::*;
use napi_derive::napi;
use windows::Win32::UI::Accessibility::*;
use windows::Win32::System::Com::*;
use windows::Win32::Foundation::RECT;
use windows::core::BOOL;

#[napi(object)]
#[derive(Clone, Default)]
pub struct UiElementInfo {
    pub name: String,
    pub control_type: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub enabled: bool,
    pub visible: bool,
    pub depth: i32,
}

#[napi]
pub fn get_ui_elements() -> Result<Vec<UiElementInfo>> {
    unsafe {
        // 初始化 COM（如果已初始化则忽略错误）
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let uia: IUIAutomation = CoCreateInstance(
            &CUIAutomation,
            None,
            CLSCTX_INPROC_SERVER,
        )
        .map_err(|e| Error::from_reason(format!("CoCreateInstance IUIAutomation: {:?}", e)))?;

        let focused = uia
            .GetFocusedElement()
            .map_err(|e| Error::from_reason(format!("GetFocusedElement: {:?}", e)))?;

        let mut results = Vec::new();
        // depth 0 = root (focused window), collect up to depth 5
        collect_elements_tree(&uia, &focused, 0, 5, &mut results)?;

        Ok(results)
    }
}

unsafe fn collect_elements_tree(
    uia: &IUIAutomation,
    elem: &IUIAutomationElement,
    depth: u32,
    max_depth: u32,
    results: &mut Vec<UiElementInfo>,
) -> Result<()> {
    if depth > max_depth {
        return Ok(());
    }

    // 包含根元素，但也收集所有子元素
    if let Ok(info) = element_to_info(elem, depth as i32) {
        // 根元素（depth==0）或无名字的不可见元素也加入调试
        if depth == 0 || !info.name.is_empty() || info.visible {
            results.push(info);
        }
    }

    // 获取子元素
    if depth < max_depth {
        if let Ok(true_cond) = uia.CreateTrueCondition() {
            if let Ok(children) = elem.FindAll(TreeScope_Children, &true_cond) {
                let count = children.Length().unwrap_or(0);
                let max_children = count.min(200);
                for i in 0..max_children {
                    if let Ok(child) = children.GetElement(i) {
                        if let Err(_e) = collect_elements_tree(uia, &child, depth + 1, max_depth, results) {
                            continue;
                        }
                        if results.len() >= 300 {
                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

unsafe fn element_to_info(elem: &IUIAutomationElement, depth: i32) -> Result<UiElementInfo> {
    let name = elem
        .CurrentName()
        .map(|s| s.to_string())
        .unwrap_or_default();

    let ctrl_type_id = elem.CurrentControlType().unwrap_or(UIA_CONTROLTYPE_ID(0));
    let control_type = control_type_name(ctrl_type_id.0);

    let rect = elem.CurrentBoundingRectangle().unwrap_or(RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    });
    let enabled = elem.CurrentIsEnabled().unwrap_or(BOOL(1));
    let is_offscreen = elem.CurrentIsOffscreen().unwrap_or(BOOL(1));

    // UIA 的 BoundingRectangle 在某些元素可能返回空 (0,0,0,0)
    let x = rect.left;
    let y = rect.top;
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    let visible = is_offscreen == BOOL(0) && width > 0 && height > 0;

    // 限制最大返回数量: 跳过不可见的、空的、位置异常的
    if width > 10000 || height > 10000 {
        return Err(Error::from_reason("element too large".to_string()));
    }

    Ok(UiElementInfo {
        name,
        control_type: control_type.to_string(),
        x,
        y,
        width,
        height,
        enabled: enabled == BOOL(1),
        visible,
        depth,
    })
}

fn control_type_name(id: i32) -> &'static str {
    match id {
        50000 => "button",
        50001 => "calendar",
        50002 => "checkbox",
        50003 => "combobox",
        50004 => "edit",
        50005 => "hyperlink",
        50006 => "image",
        50007 => "list_item",
        50008 => "list",
        50009 => "menu",
        50010 => "menu_bar",
        50011 => "menu_item",
        50012 => "progress_bar",
        50013 => "radio_button",
        50014 => "scroll_bar",
        50015 => "slider",
        50016 => "spinner",
        50017 => "status_bar",
        50018 => "tab",
        50019 => "tab_item",
        50020 => "text",
        50021 => "tool_bar",
        50022 => "tool_tip",
        50023 => "tree",
        50024 => "tree_item",
        50025 => "custom",
        50026 => "group",
        50027 => "thumb",
        50028 => "data_grid",
        50029 => "data_item",
        50030 => "document",
        50031 => "split_button",
        50032 => "window",
        50033 => "pane",
        50034 => "header",
        50035 => "header_item",
        50036 => "table",
        50037 => "title_bar",
        50038 => "separator",
        50039 => "semantic_zoom",
        50040 => "app_bar",
        _ => "unknown",
    }
}
