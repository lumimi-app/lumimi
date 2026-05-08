use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub model_path: String,
    pub font_name: String,
    pub font_size: u32,
    pub highlight_color: String,
    pub text_color: String,
    pub pre_show_s: f64,
    pub play_res_x: u32,
    pub play_res_y: u32,
    pub margin_v: u32,
    pub initial_prompt: String,
    pub max_chars_per_line: u32,
    pub font_weight: i32,
    pub highlight_style: String,
    #[serde(default = "default_display_mode")]
    pub display_mode: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_output_format")]
    pub output_format: String,
    #[serde(default = "default_output_type")]
    pub output_type: String,
    #[serde(default)]
    pub subtitle_formats: Vec<String>,
    #[serde(default = "default_position_mode")]
    pub position_mode: String,
    #[serde(default = "default_subtitle_x_pct")]
    pub subtitle_x_pct: f64,
    #[serde(default = "default_subtitle_y_pct")]
    pub subtitle_y_pct: f64,
    pub hold_s: f64,
    pub max_simultaneous_lines: u32,
    pub vertical: bool,
    pub stacking: bool,
    #[serde(default)]
    pub bilingual: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            model_path: "models/ggml-medium.bin".to_string(),
            font_name: "Montserrat".to_string(),
            font_size: 150,
            highlight_color: "&H0000FFFF&".to_string(),
            text_color: "&H00FFFFFF&".to_string(),
            pre_show_s: 0.75,
            play_res_x: 1920,
            play_res_y: 1080,
            margin_v: 30,
            initial_prompt: String::new(),
            max_chars_per_line: 0,
            font_weight: 0,
            highlight_style: "color".to_string(),
            display_mode: default_display_mode(),
            language: default_language(),
            output_format: default_output_format(),
            output_type: default_output_type(),
            subtitle_formats: vec![],
            position_mode: default_position_mode(),
            subtitle_x_pct: default_subtitle_x_pct(),
            subtitle_y_pct: default_subtitle_y_pct(),
            hold_s: 0.5,
            max_simultaneous_lines: 2,
            vertical: false,
            stacking: false,
            bilingual: false,
        }
    }
}

fn default_display_mode() -> String {
    "normal".to_string()
}

fn default_language() -> String {
    "ja".to_string()
}

fn default_output_format() -> String {
    "mp4".to_string()
}

fn default_output_type() -> String {
    "video".to_string()
}

fn default_position_mode() -> String {
    "auto".to_string()
}

fn default_subtitle_x_pct() -> f64 {
    50.0
}

fn default_subtitle_y_pct() -> f64 {
    85.0
}
