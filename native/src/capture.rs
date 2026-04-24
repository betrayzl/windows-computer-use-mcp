use std::sync::Arc;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use napi::Task;
use tokio::sync::Mutex;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC;
use windows::core::Interface;
use windows::Win32::Graphics::Direct3D::{D3D_FEATURE_LEVEL_11_0,
D3D_DRIVER_TYPE_HARDWARE};
use windows::Win32::Foundation::HMODULE;

use crate::window::WindowManager;

struct WindowRestoreGuard {
    wm: WindowManager,
    hidden: Vec<i32>,
}

impl WindowRestoreGuard {
    fn new(wm: WindowManager, hidden: Vec<i32>) -> Self {
        Self { wm, hidden }
    }
}

impl Drop for WindowRestoreGuard {
    fn drop(&mut self) {
        if !self.hidden.is_empty() {
            self.wm.unhide_windows(self.hidden.clone());
        }
    }
}

struct FrameGuard {
    duplication: IDXGIOutputDuplication,
    acquired: bool,
}

impl FrameGuard {
    fn new(duplication: IDXGIOutputDuplication) -> Self {
        Self { duplication, acquired: false }
    }
    fn mark_acquired(&mut self) {
        self.acquired = true;
    }
}

impl Drop for FrameGuard {
    fn drop(&mut self) {
        if self.acquired {
            unsafe { let _ = self.duplication.ReleaseFrame(); }
        }
    }
}

#[napi]
pub struct ScreenCapture {
    device: ID3D11Device,
    context: Arc<Mutex<ID3D11DeviceContext>>,
    factory: IDXGIFactory1,
}

#[napi]
impl ScreenCapture {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        unsafe {
            let factory: IDXGIFactory1 = CreateDXGIFactory1()
                .map_err(|e| Error::from_reason(format!("CreateDXGFactory:
{:?}", e)))?;

            let mut device = None;
            let mut context = None;
            let mut feature_level = D3D_FEATURE_LEVEL_11_0;

            let hr = D3D11CreateDevice(
                None::<&IDXGIAdapter>,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                Some(&[D3D_FEATURE_LEVEL_11_0]),
                D3D11_SDK_VERSION,
                Some(&mut device as *mut _),
                Some(&mut feature_level),
                Some(&mut context as *mut _),
            );
            if let Err(e) = hr {
                return Err(Error::from_reason(format!("D3D11CreateDevice:
{:?}", e)));
            }

            Ok(ScreenCapture {
                device: device.unwrap(),
                context: Arc::new(Mutex::new(context.unwrap())),
                factory,
            })
        }
    }

    #[napi]
    pub fn capture_screen(&self, quality: f64, max_width: u32, max_height:
u32) -> AsyncTask<CaptureTask> {
        AsyncTask::new(CaptureTask {
            device: self.device.clone(),
            context: self.context.clone(),
            factory: self.factory.clone(),
            quality,
            max_width,
            max_height,
            exclude: None,
        })
    }

    #[napi]
    pub fn capture_excluding(
        &self,
        exclude_process_names: Vec<String>,
        quality: f64,
        max_width: u32,
        max_height: u32,
    ) -> AsyncTask<CaptureTask> {
        AsyncTask::new(CaptureTask {
            device: self.device.clone(),
            context: self.context.clone(),
            factory: self.factory.clone(),
            quality,
            max_width,
            max_height,
            exclude: Some(exclude_process_names),
        })
    }

    #[napi]
    pub fn capture_region(
        &self,
        x: u32,
        y: u32,
        region_width: u32,
        region_height: u32,
        quality: f64,
        max_width: u32,
        max_height: u32,
    ) -> AsyncTask<CaptureRegionTask> {
        AsyncTask::new(CaptureRegionTask {
            device: self.device.clone(),
            context: self.context.clone(),
            factory: self.factory.clone(),
            region_x: x,
            region_y: y,
            region_width,
            region_height,
            quality,
            max_width,
            max_height,
        })
    }
}

pub struct CaptureTask {
    device: ID3D11Device,
    context: Arc<Mutex<ID3D11DeviceContext>>,
    factory: IDXGIFactory1,
    quality: f64,
    max_width: u32,
    max_height: u32,
    exclude: Option<Vec<String>>,
}

impl Task for CaptureTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        let wm = WindowManager::new()?;

        let _guard = if let Some(ref list) = self.exclude {
            let hidden = wm.hide_windows(list.clone());
            Some(WindowRestoreGuard::new(wm, hidden))
        } else {
            None
        };

        unsafe { self.do_capture_sync() }
    }

    fn resolve(&mut self, _env: napi::Env, output: Self::Output) ->
Result<Self::JsValue> {
        Ok(output)
    }
}

impl CaptureTask {
    unsafe fn do_capture_sync(&self) -> Result<String> {
        let adapter = self.factory.EnumAdapters(0)
            .map_err(|e| Error::from_reason(format!("EnumAdapters: {:?}",
e)))?;
        let output = adapter.EnumOutputs(0)
            .map_err(|e| Error::from_reason(format!("EnumOutputs: {:?}",
e)))?;
        let output1: IDXGIOutput1 = output.cast()
            .map_err(|e| Error::from_reason(format!("Cast to IDXGIOutput1:
{:?}", e)))?;

        let duplication = output1.DuplicateOutput(&self.device)
            .map_err(|e| Error::from_reason(format!("DuplicateOutput: {:?}",
e)))?;

        let mut guard = FrameGuard::new(duplication);

        // Warm-up: skip a few frames to let the DXGI duplication pipeline initialize
        for _ in 0..3 {
            let mut temp_resource = None;
            let mut temp_info = DXGI_OUTDUPL_FRAME_INFO::default();
            if let Ok(()) = guard.duplication.AcquireNextFrame(200, &mut temp_info, &mut temp_resource) {
                guard.duplication.ReleaseFrame();
                guard.acquired = false;
            }
        }

        let mut resource_option = None;
        let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();

        const MAX_RETRIES: u32 = 10;
        for _ in 0..MAX_RETRIES {
            let hr = guard.duplication.AcquireNextFrame(100, &mut frame_info,
&mut resource_option);
            match hr {
                Ok(_) => break,
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => continue,
                Err(e) => return
Err(Error::from_reason(format!("AcquireNextFrame: {:?}", e))),
            }
        }

        guard.mark_acquired();

        let resource = resource_option.ok_or_else(|| Error::from_reason("No
frame acquired"))?;
        let texture: ID3D11Texture2D = resource.cast()
            .map_err(|e| Error::from_reason(format!("Cast to texture: {:?}",
e)))?;

        let mut src_desc = D3D11_TEXTURE2D_DESC::default();
        texture.GetDesc(&mut src_desc);

        let (final_texture, final_desc) = if src_desc.SampleDesc.Count > 1 {
            let resolved_desc = D3D11_TEXTURE2D_DESC {
                Width: src_desc.Width,
                Height: src_desc.Height,
                MipLevels: 1,
                ArraySize: 1,
                Format: src_desc.Format,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: 0,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let mut resolved_texture: Option<ID3D11Texture2D> = None;
            self.device.CreateTexture2D(&resolved_desc, None, Some(&mut
resolved_texture as *mut _))
                .map_err(|e| Error::from_reason(format!("Create resolved
texture: {:?}", e)))?;
            let resolved_texture = resolved_texture.unwrap();

            let ctx = self.context.blocking_lock();
            ctx.ResolveSubresource(&resolved_texture, 0, &texture, 0,
src_desc.Format);
            (resolved_texture, src_desc)
        } else {
            (texture.clone(), src_desc)
        };

        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: final_desc.Width,
            Height: final_desc.Height,
            MipLevels: 1,
            ArraySize: 1,
            Format: final_desc.Format,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };
        let mut staging_tex: Option<ID3D11Texture2D> = None;
        self.device.CreateTexture2D(&staging_desc, None, Some(&mut staging_tex
 as *mut _))
            .map_err(|e| Error::from_reason(format!("CreateTexture2D: {:?}",
e)))?;
        let staging_tex = staging_tex.unwrap();

        {
            let ctx = self.context.blocking_lock();
            ctx.CopyResource(&staging_tex, &final_texture);
        }

        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        {
            let ctx = self.context.blocking_lock();
            ctx.Map(&staging_tex, 0, D3D11_MAP_READ, 0, Some(&mut mapped as
*mut _))
                .map_err(|e| Error::from_reason(format!("Map: {:?}", e)))?;
        }

        let width = final_desc.Width as usize;
        let height = final_desc.Height as usize;
        let row_pitch = mapped.RowPitch as usize;
        let data_ptr = mapped.pData as *const u8;

        if data_ptr.is_null() {
            return Err(Error::from_reason("Mapped pointer is null"));
        }

        let pixel_count = width * height;
        let mut rgba_data = Vec::with_capacity(pixel_count * 4);

        unsafe {
            let dst_ptr: *mut u8 = rgba_data.as_mut_ptr();
            rgba_data.set_len(pixel_count * 4);

            for y in 0..height {
                let src_row_ptr = data_ptr.add(y * row_pitch);
                let dst_row_ptr = dst_ptr.add(y * width * 4);

                for x in 0..width {
                    let s = src_row_ptr.add(x * 4);
                    let d = dst_row_ptr.add(x * 4);

                    *d = *s.add(2);
                    *d.add(1) = *s.add(1);
                    *d.add(2) = *s.add(0);
                    *d.add(3) = *s.add(3);
                }
            }
        }

        {
            let ctx = self.context.blocking_lock();
            ctx.Unmap(&staging_tex, 0);
        }

        use image::{ImageBuffer, Rgba, DynamicImage, imageops};
        use base64::{Engine as _, engine::general_purpose};

        let img_buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32,
height as u32, rgba_data)
            .ok_or_else(|| Error::from_reason("Failed to create
ImageBuffer"))?;

        // Downsample using max_width/max_height with aspect ratio preserved
        let target_w = self.max_width.max(1);
        let target_h = self.max_height.max(1);
        let dynamic_img = if width > target_w as usize || height > target_h as usize {
            let scale = (target_w as f64 / width as f64).min(target_h as f64 / height as f64);
            let nw = (width as f64 * scale) as u32;
            let nh = (height as f64 * scale) as u32;
            let resized = imageops::resize(&img_buffer, nw.max(1), nh.max(1), imageops::FilterType::CatmullRom);
            DynamicImage::ImageRgba8(resized)
        } else {
            DynamicImage::ImageRgba8(img_buffer)
        };

        // quality: f64 (0.0-1.0) → u8 (1-100), clamp to valid range
        let quality_u8 = (self.quality.clamp(0.0, 1.0) * 100.0).round() as u8;
        let quality_u8 = quality_u8.clamp(1, 100);
        let mut jpeg_bytes = Vec::new();
        {
            let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
            let mut encoder =
image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality_u8);
            encoder.encode_image(&dynamic_img)
                .map_err(|e| Error::from_reason(format!("JPEG encoding: {:?}",
e)))?;
        }

        let base64_str = general_purpose::STANDARD.encode(&jpeg_bytes);
        Ok(base64_str)
    }
}

pub struct CaptureRegionTask {
    device: ID3D11Device,
    context: Arc<Mutex<ID3D11DeviceContext>>,
    factory: IDXGIFactory1,
    region_x: u32,
    region_y: u32,
    region_width: u32,
    region_height: u32,
    quality: f64,
    max_width: u32,
    max_height: u32,
}

impl Task for CaptureRegionTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        unsafe { self.do_region_capture_sync() }
    }

    fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

impl CaptureRegionTask {
    unsafe fn do_region_capture_sync(&self) -> Result<String> {
        // Same DXGI pipeline as full capture, but only read region pixels
        let adapter = self.factory.EnumAdapters(0)
            .map_err(|e| Error::from_reason(format!("EnumAdapters: {:?}", e)))?;
        let output = adapter.EnumOutputs(0)
            .map_err(|e| Error::from_reason(format!("EnumOutputs: {:?}", e)))?;
        let output1: IDXGIOutput1 = output.cast()
            .map_err(|e| Error::from_reason(format!("Cast to IDXGIOutput1: {:?}", e)))?;

        let duplication = output1.DuplicateOutput(&self.device)
            .map_err(|e| Error::from_reason(format!("DuplicateOutput: {:?}", e)))?;

        let mut guard = FrameGuard::new(duplication);

        // Warm-up: skip a few frames
        for _ in 0..3 {
            let mut temp_resource = None;
            let mut temp_info = DXGI_OUTDUPL_FRAME_INFO::default();
            if let Ok(()) = guard.duplication.AcquireNextFrame(200, &mut temp_info, &mut temp_resource) {
                guard.duplication.ReleaseFrame();
                guard.acquired = false;
            }
        }

        let mut resource_option = None;
        let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();

        const MAX_RETRIES: u32 = 10;
        for _ in 0..MAX_RETRIES {
            let hr = guard.duplication.AcquireNextFrame(100, &mut frame_info, &mut resource_option);
            match hr {
                Ok(_) => break,
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => continue,
                Err(e) => return Err(Error::from_reason(format!("AcquireNextFrame: {:?}", e))),
            }
        }

        guard.mark_acquired();

        let resource = resource_option.ok_or_else(|| Error::from_reason("No frame acquired"))?;
        let texture: ID3D11Texture2D = resource.cast()
            .map_err(|e| Error::from_reason(format!("Cast to texture: {:?}", e)))?;

        let mut src_desc = D3D11_TEXTURE2D_DESC::default();
        texture.GetDesc(&mut src_desc);

        let (final_texture, final_desc) = if src_desc.SampleDesc.Count > 1 {
            let resolved_desc = D3D11_TEXTURE2D_DESC {
                Width: src_desc.Width,
                Height: src_desc.Height,
                MipLevels: 1, ArraySize: 1,
                Format: src_desc.Format,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: 0, CPUAccessFlags: 0, MiscFlags: 0,
            };
            let mut resolved_texture: Option<ID3D11Texture2D> = None;
            self.device.CreateTexture2D(&resolved_desc, None, Some(&mut resolved_texture as *mut _))
                .map_err(|e| Error::from_reason(format!("Create resolved texture: {:?}", e)))?;
            let resolved_texture = resolved_texture.unwrap();
            let ctx = self.context.blocking_lock();
            ctx.ResolveSubresource(&resolved_texture, 0, &texture, 0, src_desc.Format);
            (resolved_texture, src_desc)
        } else {
            (texture.clone(), src_desc)
        };

        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: final_desc.Width,
            Height: final_desc.Height,
            MipLevels: 1, ArraySize: 1,
            Format: final_desc.Format,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };
        let mut staging_tex: Option<ID3D11Texture2D> = None;
        self.device.CreateTexture2D(&staging_desc, None, Some(&mut staging_tex as *mut _))
            .map_err(|e| Error::from_reason(format!("CreateTexture2D: {:?}", e)))?;
        let staging_tex = staging_tex.unwrap();

        {
            let ctx = self.context.blocking_lock();
            ctx.CopyResource(&staging_tex, &final_texture);
        }

        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        {
            let ctx = self.context.blocking_lock();
            ctx.Map(&staging_tex, 0, D3D11_MAP_READ, 0, Some(&mut mapped as *mut _))
                .map_err(|e| Error::from_reason(format!("Map: {:?}", e)))?;
        }

        let frame_width = final_desc.Width as usize;
        let row_pitch = mapped.RowPitch as usize;
        let data_ptr = mapped.pData as *const u8;
        if data_ptr.is_null() {
            return Err(Error::from_reason("Mapped pointer is null"));
        }

        // Clip region to frame bounds
        let rx = (self.region_x as usize).min(frame_width.saturating_sub(1));
        let ry = (self.region_y as usize).min(final_desc.Height as usize - 1);
        let rw = (self.region_width as usize).min(frame_width - rx);
        let rh = (self.region_height as usize).min(final_desc.Height as usize - ry);

        if rw == 0 || rh == 0 {
            return Err(Error::from_reason("Region is empty after clipping"));
        }

        let pixel_count = rw * rh;
        let mut rgba_data = Vec::with_capacity(pixel_count * 4);

        unsafe {
            let dst_ptr: *mut u8 = rgba_data.as_mut_ptr();
            rgba_data.set_len(pixel_count * 4);

            for y in 0..rh {
                let src_row_ptr = data_ptr.add((ry + y) * row_pitch);
                let dst_row_ptr = dst_ptr.add(y * rw * 4);

                for x in 0..rw {
                    let s = src_row_ptr.add((rx + x) * 4);
                    let d = dst_row_ptr.add(x * 4);
                    *d = *s.add(2);
                    *d.add(1) = *s.add(1);
                    *d.add(2) = *s.add(0);
                    *d.add(3) = *s.add(3);
                }
            }
        }

        {
            let ctx = self.context.blocking_lock();
            ctx.Unmap(&staging_tex, 0);
        }

        use image::{ImageBuffer, Rgba, DynamicImage, imageops};
        use base64::{Engine as _, engine::general_purpose};

        let img_buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(rw as u32, rh as u32, rgba_data)
            .ok_or_else(|| Error::from_reason("Failed to create ImageBuffer"))?;

        // Downsample region if needed
        let target_w = self.max_width.max(1);
        let target_h = self.max_height.max(1);
        let dynamic_img = if rw > target_w as usize || rh > target_h as usize {
            let scale = (target_w as f64 / rw as f64).min(target_h as f64 / rh as f64);
            let nw = (rw as f64 * scale) as u32;
            let nh = (rh as f64 * scale) as u32;
            let resized = imageops::resize(&img_buffer, nw.max(1), nh.max(1), imageops::FilterType::CatmullRom);
            DynamicImage::ImageRgba8(resized)
        } else {
            DynamicImage::ImageRgba8(img_buffer)
        };

        let quality_u8 = (self.quality.clamp(0.0, 1.0) * 100.0).round() as u8;
        let quality_u8 = quality_u8.clamp(1, 100);
        let mut jpeg_bytes = Vec::new();
        {
            let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality_u8);
            encoder.encode_image(&dynamic_img)
                .map_err(|e| Error::from_reason(format!("JPEG encoding: {:?}", e)))?;
        }

        let base64_str = general_purpose::STANDARD.encode(&jpeg_bytes);
        Ok(base64_str)
    }
}
