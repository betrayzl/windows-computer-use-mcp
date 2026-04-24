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
    pub fn key(&mut self, sequence: String, action: String) -> Result<()> {
        match action.as_str() {
            "press" => {
                // 当收到 press 指令时，执行一次完整的组合键序列
                self.execute_key_sequence(&sequence)
            }
            "release" => {
                // release 指令在组合键模式下无实际意义，忽略以保持接口兼容
                Ok(())
            }
            "click" => {
                // 保留原有点击逻辑（单键点击）
                let k = map_single_key(&sequence)?;
                self.enigo.key(k, enigo::Direction::Click)
                    .map_err(|e| Error::from_reason(e.to_string()))
            }
            _ => Err(Error::from_reason("Unsupported action".to_string())),
        }
    }

    #[napi]
    pub fn release_all_modifiers(&mut self) -> Result<()> {
        // 释放所有可能的修饰键，防止按键卡死
        let modifiers = [enigo::Key::Control, enigo::Key::Shift, enigo::Key::Alt, enigo::Key::Meta];
        for &key in &modifiers {
            let _ = self.enigo.key(key, enigo::Direction::Release);
        }
        // 短暂等待确保操作系统处理完释放事件
        std::thread::sleep(std::time::Duration::from_millis(10));
        // 再发一轮确保状态清除
        for &key in &modifiers {
            let _ = self.enigo.key(key, enigo::Direction::Release);
        }
        Ok(())
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

impl InputController {
    fn parse_key_sequence(&self, sequence: &str) -> Result<(Vec<enigo::Key>, enigo::Key)> {
        let tokens: Vec<&str> = sequence.split('+').map(|s| s.trim()).collect();
        if tokens.is_empty() {
            return Err(Error::from_reason("Empty key sequence".to_string()));
        }

        let mut modifiers = Vec::new();
        let mut main_key = None;

        for token in &tokens {
            let k = map_single_key(token)?;
            match k {
                enigo::Key::Alt | enigo::Key::Control | enigo::Key::Shift | enigo::Key::Meta => {
                    modifiers.push(k);
                }
                _ => {
                    if main_key.is_some() {
                        return Err(Error::from_reason("Multiple non-modifier keys in sequence".to_string()));
                    }
                    main_key = Some(k);
                }
            }
        }

        let main_key = main_key.ok_or_else(|| Error::from_reason("No main key specified".to_string()))?;
        Ok((modifiers, main_key))
    }

    fn execute_key_sequence(&mut self, sequence: &str) -> Result<()> {
        let (modifiers, main_key) = self.parse_key_sequence(sequence)?;

        // 1. 按下所有修饰键
        for &mod_key in &modifiers {
            self.enigo.key(mod_key, enigo::Direction::Press)
                .map_err(|e| Error::from_reason(e.to_string()))?;
        }

        // 重要：给操作系统一点时间注册修饰键状态
        std::thread::sleep(std::time::Duration::from_millis(10));

        // 2. 按下主键
        self.enigo.key(main_key, enigo::Direction::Press)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        // 3. 保持短暂时间（让组合键生效）
        std::thread::sleep(std::time::Duration::from_millis(50));

        // 4. 释放主键
        self.enigo.key(main_key, enigo::Direction::Release)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        // 5. 再等一小段时间
        std::thread::sleep(std::time::Duration::from_millis(10));

        // 6. 释放所有修饰键（逆序）
        for &mod_key in modifiers.iter().rev() {
            self.enigo.key(mod_key, enigo::Direction::Release)
                .map_err(|e| Error::from_reason(e.to_string()))?;
        }

        Ok(())
    }
}

fn map_single_key(key: &str) -> Result<enigo::Key> {
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
        "up" => Ok(Key::UpArrow),
        "down" => Ok(Key::DownArrow),
        "left" => Ok(Key::LeftArrow),
        "right" => Ok(Key::RightArrow),
        "f1" => Ok(Key::F1), "f2" => Ok(Key::F2), "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4), "f5" => Ok(Key::F5), "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7), "f8" => Ok(Key::F8), "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10), "f11" => Ok(Key::F11), "f12" => Ok(Key::F12),
        "a" => Ok(Key::A), "b" => Ok(Key::B), "c" => Ok(Key::C), "d" => Ok(Key::D),
        "e" => Ok(Key::E), "f" => Ok(Key::F), "g" => Ok(Key::G), "h" => Ok(Key::H),
        "i" => Ok(Key::I), "j" => Ok(Key::J), "k" => Ok(Key::K), "l" => Ok(Key::L),
        "m" => Ok(Key::M), "n" => Ok(Key::N), "o" => Ok(Key::O), "p" => Ok(Key::P),
        "q" => Ok(Key::Q), "r" => Ok(Key::R), "s" => Ok(Key::S), "t" => Ok(Key::T),
        "u" => Ok(Key::U), "v" => Ok(Key::V), "w" => Ok(Key::W), "x" => Ok(Key::X),
        "y" => Ok(Key::Y), "z" => Ok(Key::Z),
        _ => Err(Error::from_reason(format!("Unsupported key: {}", key))),
    }
}
