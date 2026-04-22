use enigo::*;
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct MouseLocation {
    pub x: i32,
    pub y: i32,
}

#[napi]
pub struct InputController {
    enigo: Enigo,
}

#[napi]
impl InputController {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        Ok(InputController {
            enigo: Enigo::new(&Settings::default()).map_err(|e| Error::from_reason(e.to_string()))?,
        })
    }

    #[napi]
    pub fn move_mouse(&mut self, x: i32, y: i32) -> Result<()> {
        self.enigo.move_mouse(x, y, enigo::Coordinate::Abs).map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn mouse_button(&mut self, button: String, action: String) -> Result<()> {
        let btn = match button.as_str() {
            "left" => enigo::Button::Left,
            "right" => enigo::Button::Right,
            "middle" => enigo::Button::Middle,
            _ => return Err(Error::from_reason("Unsupported button".to_string())),
        };
        let dir = match action.as_str() {
            "press" => enigo::Direction::Press,
            "release" => enigo::Direction::Release,
            "click" => enigo::Direction::Click,
            _ => return Err(Error::from_reason("Unsupported action".to_string())),
        };
        self.enigo.button(btn, dir).map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn key(&mut self, key: String, action: String) -> Result<()> {
        let k = map_key(&key)?;
        let dir = match action.as_str() {
            "press" => enigo::Direction::Press,
            "release" => enigo::Direction::Release,
            "click" => enigo::Direction::Click,
            _ => return Err(Error::from_reason("Unsupported action".to_string())),
        };
        self.enigo.key(k, dir).map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn type_text(&mut self, text: String) -> Result<()> {
        self.enigo.text(&text).map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn get_mouse_location(&self) -> Result<MouseLocation> {
        let (x, y) = self.enigo.location().map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(MouseLocation { x: x as i32, y: y as i32 })
    }
}

// 辅助函数：将字符串键名映射为 enigo::Key
fn map_key(key: &str) -> Result<enigo::Key> {
    use enigo::Key;
    match key.to_lowercase().as_str() {
        "escape" | "esc" => Ok(Key::Escape),
        "enter" | "return" => Ok(Key::Return),
        "space" => Ok(Key::Space),
        "backspace" => Ok(Key::Backspace),
        "tab" => Ok(Key::Tab),
        "control" | "ctrl" => Ok(Key::Control),
        "alt" => Ok(Key::Alt),
        "shift" => Ok(Key::Shift),
        "meta" | "windows" | "command" => Ok(Key::Meta),
        "a" => Ok(Key::A),
        "b" => Ok(Key::B),
        "c" => Ok(Key::C),
        "v" => Ok(Key::V),
        "x" => Ok(Key::X),
        _ => Err(Error::from_reason(format!("Unsupported key: {}", key))),
    }
}
