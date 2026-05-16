use anyhow::Result;
use std::fmt::Write as FmtWrite;
use std::fs;

use crate::settings::Settings;
use crate::tokenize::Word;
use crate::transcribe::Segment;

fn format_ass_time(secs: f64) -> String {
    let total_cs = (secs.max(0.0) * 100.0).round() as i64;
    let h = total_cs / 360000;
    let m = (total_cs % 360000) / 6000;
    let s = (total_cs % 6000) / 100;
    let cs = total_cs % 100;
    format!("{:01}:{:02}:{:02}.{:02}", h, m, s, cs)
}

/// Prepend alpha bytes onto an ASS colour string `&HAABBGGRR&`.
fn with_alpha(color: &str, alpha: u8) -> String {
    let hex = color.trim_start_matches("&H").trim_end_matches('&');
    if hex.len() >= 8 {
        format!("&H{:02X}{}&", alpha, &hex[2..])
    } else {
        color.to_string()
    }
}

fn words_to_karaoke(words: &[Word], pre_show_s: f64, highlight_style: &str) -> String {
    let pre_cs = (pre_show_s * 100.0).round() as u64;
    let mut result = format!("{{\\k{}}}", pre_cs);

    for (i, w) in words.iter().enumerate() {
        let dur_s = if i + 1 < words.len() {
            (words[i + 1].start - w.start).max(0.01)
        } else {
            (w.end - w.start).max(0.01)
        };
        let dur_cs = (dur_s * 100.0).round() as u64;
        match highlight_style {
            "fill" => {
                let _ = write!(result, "{{\\kf{}}}{}", dur_cs, w.text);
            }
            "color_hold" | "dim_hold" => {
                let _ = write!(result, "{{\\k{}}}{}", dur_cs, w.text);
            }
            "scale" => {
                let _ = write!(
                    result,
                    "{{\\fscx100\\fscy100\\k{}\\t(\\fscx115\\fscy115)}}{}",
                    dur_cs, w.text
                );
            }
            "glow" => {
                let _ = write!(result, "{{\\blur0\\k{}\\t(\\blur5)}}{}", dur_cs, w.text);
            }
            _ => {
                let _ = write!(result, "{{\\k{}}}{}", dur_cs, w.text);
            }
        }
    }

    result
}

fn words_to_text(words: &[Word]) -> String {
    words.iter().map(|w| w.text.as_str()).collect::<String>()
}

fn pct_to_coord(pct: f64, max: u32) -> u32 {
    ((pct.clamp(0.0, 100.0) / 100.0) * max as f64).round() as u32
}

fn is_word_popup_mode(display_mode: &str) -> bool {
    display_mode == "word_popup" || display_mode == "single_word"
}

fn is_word_build_mode(display_mode: &str) -> bool {
    display_mode == "word_build"
}

fn is_word_build_left_mode(display_mode: &str) -> bool {
    display_mode == "word_build_left"
}

// Split words into lines of at most max_chars characters each.
// Returns slices into the original slice.
fn split_into_lines(words: &[Word], max_chars: usize) -> Vec<&[Word]> {
    let mut lines = Vec::new();
    let mut start = 0;
    let mut line_chars: usize = 0;

    for (i, w) in words.iter().enumerate() {
        let wlen = w.text.chars().count();
        if line_chars > 0 && line_chars + wlen > max_chars {
            lines.push(&words[start..i]);
            start = i;
            line_chars = 0;
        }
        line_chars += wlen;
    }
    if start < words.len() {
        lines.push(&words[start..]);
    }
    lines
}

fn split_for_display_mode<'a>(
    words: &'a [Word],
    max_chars: usize,
    display_mode: &str,
) -> Vec<&'a [Word]> {
    if is_word_popup_mode(display_mode) {
        (0..words.len()).map(|i| &words[i..i + 1]).collect()
    } else {
        split_into_lines(words, max_chars)
    }
}

fn emit_build_left_line(
    content: &mut String,
    line_words: &[Word],
    hold_s: f64,
    max_lines: usize,
    manual_position: bool,
    manual_x: u32,
    manual_y: u32,
    ends: &mut std::collections::VecDeque<f64>,
) {
    let last = line_words.last().expect("non-empty line");
    for i in 0..line_words.len() {
        let current = &line_words[i];
        let next_start = line_words.get(i + 1).map(|w| w.start);
        let diag_end = next_start.unwrap_or(last.end + hold_s);
        let min_start = if ends.len() >= max_lines {
            *ends.front().unwrap()
        } else {
            0.0
        };
        let diag_start = current.start.max(0.0).max(min_start);

        let visible = words_to_text(&line_words[..=i]);
        let invisible = words_to_text(&line_words[i + 1..]);
        let text = if invisible.is_empty() {
            visible
        } else {
            format!("{}{{\\alpha&HFF&}}{}", visible, invisible)
        };
        let pos_tag = if manual_position {
            format!("{{\\pos({},{})}}", manual_x, manual_y)
        } else {
            String::new()
        };
        let _ = writeln!(
            content,
            "Dialogue: 0,{},{},Default,,0,0,0,,{}{}",
            format_ass_time(diag_start),
            format_ass_time(diag_end),
            pos_tag,
            text,
        );
        if ends.len() >= max_lines {
            ends.pop_front();
        }
        ends.push_back(diag_end);
    }
}

fn emit_build_line(
    content: &mut String,
    line_words: &[Word],
    hold_s: f64,
    max_lines: usize,
    manual_position: bool,
    manual_x: u32,
    manual_y: u32,
    is_vertical: bool,
    play_res_x: u32,
    margin_h: u32,
    col_step: u32,
    vertical_anchor_y: u32,
    line_count: usize,
    ends: &mut std::collections::VecDeque<f64>,
) {
    let last = line_words.last().expect("non-empty line");
    for i in 0..line_words.len() {
        let current = &line_words[i];
        let next_start = line_words.get(i + 1).map(|w| w.start);
        let diag_end = next_start.unwrap_or(last.end + hold_s);
        let min_start = if ends.len() >= max_lines {
            *ends.front().unwrap()
        } else {
            0.0
        };
        let diag_start = current.start.max(0.0).max(min_start);
        let text = words_to_text(&line_words[..=i]);

        let pos_tag = if manual_position {
            format!("{{\\pos({},{})}}", manual_x, manual_y)
        } else if is_vertical {
            let col = line_count % max_lines;
            let x = (play_res_x as i32 - margin_h as i32 - col as i32 * col_step as i32).max(0);
            format!("{{\\pos({},{})}}", x, vertical_anchor_y)
        } else {
            String::new()
        };
        let _ = writeln!(
            content,
            "Dialogue: 0,{},{},Default,,0,0,0,,{}{}",
            format_ass_time(diag_start),
            format_ass_time(diag_end),
            pos_tag,
            text,
        );
        if ends.len() >= max_lines {
            ends.pop_front();
        }
        ends.push_back(diag_end);
    }
}

pub fn generate(
    segments: &[(Segment, Vec<Word>)],
    output_path: &str,
    settings: &Settings,
    translation: Option<&[Segment]>,
) -> Result<()> {
    let mut content = String::new();

    // Script Info
    let _ = writeln!(content, "[Script Info]");
    let _ = writeln!(content, "ScriptType: v4.00+");
    let _ = writeln!(content, "PlayResX: {}", settings.play_res_x);
    let _ = writeln!(content, "PlayResY: {}", settings.play_res_y);
    let _ = writeln!(content, "ScaledBorderAndShadow: yes");
    let _ = writeln!(content, "WrapStyle: 0");
    let _ = writeln!(content);

    // Styles
    let _ = writeln!(content, "[V4+ Styles]");
    let _ = writeln!(
        content,
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
    );
    let margin_h = settings.play_res_x / 10;
    let max_line_chars = if settings.vertical {
        // Vertical columns must fit within the screen height regardless of the user-set value.
        // A 15-char default × 144px/char = 2160px overflows a 1920px portrait screen, which
        // pushes start_y to 0 (clamped) and the subtitle starts at the very top.
        let char_h = (settings.font_size + settings.font_size / 5).max(1);
        let screen_max = (settings.play_res_y * 2 / 3 / char_h).max(5) as usize;
        if settings.max_chars_per_line > 0 {
            (settings.max_chars_per_line as usize).min(screen_max)
        } else {
            screen_max
        }
    } else if settings.max_chars_per_line > 0 {
        settings.max_chars_per_line as usize
    } else {
        ((settings.play_res_x - 2 * margin_h) / settings.font_size).max(5) as usize
    };
    // Dim styles: unspoken words rendered at 50% opacity via SecondaryColour alpha.
    let secondary_color =
        if settings.highlight_style == "dim" || settings.highlight_style == "dim_hold" {
            with_alpha(&settings.text_color, 0x80)
        } else {
            settings.text_color.clone()
        };
    // Alignment: vertical→9 (top-right), stacking horizontal→8 (top-center), normal→2 (bottom-center).
    // NOTE: Do NOT use the "@" font prefix for vertical mode. The "@" variant contains pre-rotated
    // glyphs (90° CW) designed for Windows GDI vertical layout; libass renders them as horizontal
    // text with rotated glyphs, which causes the 90° tilt seen in the exported video.
    let style_font = settings.font_name.clone();
    let stacking_mode = settings.stacking || settings.display_mode == "stacking";
    let manual_position = settings.position_mode == "manual";
    let manual_x = pct_to_coord(settings.subtitle_x_pct, settings.play_res_x);
    let manual_y = pct_to_coord(settings.subtitle_y_pct, settings.play_res_y);
    let vertical_centered = settings.vertical && settings.margin_v >= settings.play_res_y / 2;
    let vertical_anchor_y = if vertical_centered {
        settings.play_res_y / 2
    } else {
        settings.margin_v
    };
    let alignment = if manual_position {
        5u32
    } else if settings.vertical {
        if vertical_centered {
            6u32
        } else {
            9u32
        }
    } else if stacking_mode {
        8u32
    } else {
        2u32
    };
    let _ = writeln!(
        content,
        "Style: Default,{},{},{},{},&H00000000,&H00000000,{},0,0,0,100,100,0,0,1,3,0,{},{},{},{},1",
        style_font,
        settings.font_size,
        settings.highlight_color,
        secondary_color,
        settings.font_weight,
        alignment,
        margin_h,
        margin_h,
        settings.margin_v,
    );
    // Translation style: smaller font, positioned above the primary subtitle
    if translation.is_some() {
        let tr_font_size = (settings.font_size as f64 * 0.6).round().max(24.0) as u32;
        // Portrait + vertical: columns occupy the center; put translation at the top (an8)
        // with a small top gap to avoid overlapping video titles/descriptions at the bottom.
        // Otherwise, place it above the primary subtitle at the bottom (an2).
        let (tr_alignment, tr_margin_v) = if vertical_centered {
            (8u32, tr_font_size + 10)
        } else {
            (2u32, settings.margin_v + settings.font_size + 10)
        };
        let _ = writeln!(
            content,
            "Style: Translation,{},{},{},{},&H00000000&,&H00000000&,0,0,0,0,100,100,0,0,1,2,0,{},{},{},{},1",
            settings.font_name,
            tr_font_size,
            settings.text_color,
            settings.text_color,
            tr_alignment,
            margin_h,
            margin_h,
            tr_margin_v,
        );
    }
    let _ = writeln!(content);

    // Events
    let _ = writeln!(content, "[Events]");
    let _ = writeln!(
        content,
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    );

    let word_popup_mode = is_word_popup_mode(&settings.display_mode);
    let word_build_mode = is_word_build_mode(&settings.display_mode);
    let word_build_left_mode = is_word_build_left_mode(&settings.display_mode);
    let max_lines = if word_popup_mode || word_build_mode || word_build_left_mode {
        1
    } else {
        (settings.max_simultaneous_lines.max(1)) as usize
    };
    let mut ends: std::collections::VecDeque<f64> = std::collections::VecDeque::new();
    let col_step = settings.font_size + settings.font_size / 4;
    let line_spacing = settings.font_size / 5;
    let mut line_count: usize = 0;

    // Two-pass state for vertical stacking with era resets.
    struct VertColEvent {
        diag_start: f64,
        col_x: u32,
        start_y: u32,
        body: String,
        era: usize,
    }
    let mut vert_cols: Vec<VertColEvent> = Vec::new();
    let mut vert_era = 0usize;
    let mut vert_era_line = 0usize;

    // Stacking mode: each line stays visible until the end of the video.
    let stack_end = if stacking_mode {
        segments
            .iter()
            .flat_map(|(_, words)| words.iter())
            .map(|w| w.end)
            .fold(0.0f64, f64::max)
            + 1.0
    } else {
        0.0
    };

    for (_, words) in segments {
        if words.is_empty() {
            continue;
        }

        for line_words in split_for_display_mode(words, max_line_chars, &settings.display_mode) {
            if line_words.is_empty() {
                continue;
            }

            let first = &line_words[0];
            let last = line_words.last().unwrap();

            if word_build_left_mode && !stacking_mode {
                // Fixed-position build: write the full line each step but hide future words
                // with \alpha&HFF& so ASS always centers on the complete line length.
                emit_build_left_line(
                    &mut content,
                    line_words,
                    settings.hold_s,
                    max_lines,
                    manual_position,
                    manual_x,
                    manual_y,
                    &mut ends,
                );
                line_count += 1;
                continue;
            }

            if word_build_mode && !stacking_mode {
                emit_build_line(
                    &mut content,
                    line_words,
                    settings.hold_s,
                    max_lines,
                    manual_position,
                    manual_x,
                    manual_y,
                    settings.vertical,
                    settings.play_res_x,
                    margin_h,
                    col_step,
                    vertical_anchor_y,
                    line_count,
                    &mut ends,
                );
                line_count += 1;
                continue;
            }

            // Vertical stacking: render characters top-to-bottom using \N newlines.
            // @-font horizontal layout causes 90° tilt in libass because the pre-rotated
            // glyphs are arranged left-to-right rather than in a true vertical column.
            // \N with a plain font produces upright characters in a vertical column,
            // matching the canvas preview's per-character y-offset approach.
            if stacking_mode && settings.vertical {
                // Determine raw x before clamping to detect off-screen columns.
                let col_x_base = if manual_position {
                    manual_x as i32
                } else {
                    settings.play_res_x as i32 - margin_h as i32
                };
                let col_x_raw = col_x_base - vert_era_line as i32 * col_step as i32;
                // col_x is the \an9 anchor (right edge of column). If col_x_raw <= 0
                // the whole column is off-screen left → start a new era (reset).
                if col_x_raw <= 0 {
                    vert_era += 1;
                    vert_era_line = 0;
                }
                let col_x = (col_x_base - vert_era_line as i32 * col_step as i32).max(0) as u32;
                let anchor_y = if manual_position {
                    manual_y
                } else {
                    vertical_anchor_y
                };
                let diag_start = first.start.max(0.0);
                let text = words_to_text(line_words);
                let chars: Vec<char> = text.chars().collect();
                let n = chars.len() as u32;
                let char_h = settings.font_size + settings.font_size / 5;
                let block_h = n * char_h;
                let start_y = (anchor_y as i32 - block_h as i32 / 2).max(0) as u32;
                let body: String = chars
                    .iter()
                    .map(|c| c.to_string())
                    .collect::<Vec<_>>()
                    .join("\\N");
                vert_cols.push(VertColEvent {
                    diag_start,
                    col_x,
                    start_y,
                    body,
                    era: vert_era,
                });
                vert_era_line += 1;
                line_count += 1;
                continue;
            }

            let (diag_start, diag_end, karaoke) = if stacking_mode {
                // No timing constraint — lines appear when spoken and never disappear.
                let (ds, karo) = if settings.highlight_style == "none" {
                    let ds = first.start.max(0.0);
                    let text = words_to_text(line_words);
                    (ds, text)
                } else {
                    let ds = (first.start - settings.pre_show_s).max(0.0);
                    let actual_pre = (first.start - ds).max(0.0);
                    (
                        ds,
                        words_to_karaoke(line_words, actual_pre, &settings.highlight_style),
                    )
                };
                (ds, stack_end, karo)
            } else {
                let diag_end = last.end + settings.hold_s;
                let min_start = if ends.len() >= max_lines {
                    *ends.front().unwrap()
                } else {
                    0.0
                };
                let (ds, karo) = if settings.highlight_style == "none" {
                    let ds = first.start.max(0.0).max(min_start);
                    let text = words_to_text(line_words);
                    (ds, text)
                } else {
                    let natural_start = (first.start - settings.pre_show_s).max(0.0);
                    let ds = natural_start.max(min_start);
                    let actual_pre = (first.start - ds).max(0.0);
                    (
                        ds,
                        words_to_karaoke(line_words, actual_pre, &settings.highlight_style),
                    )
                };
                (ds, diag_end, karo)
            };

            let pos_tag = if manual_position && stacking_mode && settings.vertical {
                let x = (manual_x as i32 - line_count as i32 * col_step as i32).max(0);
                format!("{{\\pos({},{})}}", x, manual_y)
            } else if manual_position && stacking_mode {
                let y = manual_y + line_count as u32 * (settings.font_size + line_spacing);
                format!("{{\\pos({},{})}}", manual_x, y)
            } else if manual_position && settings.vertical {
                let col = line_count % max_lines;
                let x = (manual_x as i32 - col as i32 * col_step as i32).max(0);
                format!("{{\\pos({},{})}}", x, manual_y)
            } else if manual_position {
                format!("{{\\pos({},{})}}", manual_x, manual_y)
            } else if stacking_mode && settings.vertical {
                // Stacking columns right to left
                let x = (settings.play_res_x as i32
                    - margin_h as i32
                    - line_count as i32 * col_step as i32)
                    .max(0);
                format!("{{\\pos({},{})}}", x, vertical_anchor_y)
            } else if stacking_mode {
                // Stacking rows top to bottom
                let y = settings.margin_v + line_count as u32 * (settings.font_size + line_spacing);
                format!("{{\\pos({},{})}}", settings.play_res_x / 2, y)
            } else if settings.vertical {
                // Normal vertical: cycle through columns
                let col = line_count % max_lines;
                let x =
                    (settings.play_res_x as i32 - margin_h as i32 - col as i32 * col_step as i32)
                        .max(0);
                format!("{{\\pos({},{})}}", x, vertical_anchor_y)
            } else {
                String::new()
            };

            let _ = writeln!(
                content,
                "Dialogue: 0,{},{},Default,,0,0,0,,{}{}",
                format_ass_time(diag_start),
                format_ass_time(diag_end),
                pos_tag,
                karaoke,
            );

            line_count += 1;
            if !stacking_mode {
                if ends.len() >= max_lines {
                    ends.pop_front();
                }
                ends.push_back(diag_end);
            }
        }
    }

    // Flush vertical stacking columns with per-era end times.
    // Each era ends when the next era's first column starts, so old columns disappear cleanly.
    if !vert_cols.is_empty() {
        let max_era = vert_cols.iter().map(|c| c.era).max().unwrap_or(0);
        let mut era_ends = vec![stack_end; max_era + 1];
        for i in 1..vert_cols.len() {
            if vert_cols[i].era > vert_cols[i - 1].era {
                era_ends[vert_cols[i - 1].era] = vert_cols[i].diag_start;
            }
        }
        for col in &vert_cols {
            let _ = writeln!(
                content,
                "Dialogue: 0,{},{},Default,,0,0,0,,{{\\an9\\pos({},{})}}{}",
                format_ass_time(col.diag_start),
                format_ass_time(era_ends[col.era]),
                col.col_x,
                col.start_y,
                col.body,
            );
        }
    }

    // Translation events: plain single line per segment, no highlighting.
    if let Some(trans_segs) = translation {
        for seg in trans_segs {
            let _ = writeln!(
                content,
                "Dialogue: 0,{},{},Translation,,0,0,0,,{}",
                format_ass_time(seg.start),
                format_ass_time(seg.end),
                seg.text.trim(),
            );
        }
    }

    fs::write(output_path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tokenize::Word;

    fn w(text: &str, start: f64, end: f64) -> Word {
        Word {
            text: text.to_string(),
            start,
            end,
        }
    }

    #[test]
    fn format_ass_time_zero() {
        assert_eq!(format_ass_time(0.0), "0:00:00.00");
    }

    #[test]
    fn format_ass_time_one_hour() {
        assert_eq!(format_ass_time(3661.5), "1:01:01.50");
    }

    #[test]
    fn format_ass_time_negative_clamps() {
        assert_eq!(format_ass_time(-1.0), "0:00:00.00");
    }

    #[test]
    fn with_alpha_sets_alpha_bytes() {
        assert_eq!(with_alpha("&H00FFFFFF&", 0x80), "&H80FFFFFF&");
        assert_eq!(with_alpha("&H00000000&", 0xFF), "&HFF000000&");
    }

    #[test]
    fn with_alpha_short_passes_through() {
        let short = "&H000000&";
        assert_eq!(with_alpha(short, 0x80), short);
    }

    #[test]
    fn split_into_lines_single_chunk_under_limit() {
        let words = vec![w("Hello", 0.0, 0.5), w("World", 0.5, 1.0)];
        let lines = split_into_lines(&words, 20);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].len(), 2);
    }

    #[test]
    fn split_into_lines_breaks_at_max_chars() {
        // "Hello"=5, "World"=5, "Foo"=3 with max_chars=6
        let words = vec![
            w("Hello", 0.0, 0.5),
            w("World", 0.5, 1.0),
            w("Foo", 1.0, 1.5),
        ];
        let lines = split_into_lines(&words, 6);
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0][0].text, "Hello");
        assert_eq!(lines[1][0].text, "World");
        assert_eq!(lines[2][0].text, "Foo");
    }

    #[test]
    fn words_to_karaoke_starts_with_pre_tag() {
        let words = vec![w("A", 0.5, 1.0), w("B", 1.0, 1.5)];
        let result = words_to_karaoke(&words, 0.0, "color");
        assert!(result.starts_with("{\\k0}"), "got: {result}");
        assert!(result.contains("A"));
        assert!(result.contains("B"));
    }

    #[test]
    fn words_to_karaoke_fill_uses_kf_tag() {
        let words = vec![w("A", 0.0, 0.5), w("B", 0.5, 1.0)];
        let result = words_to_karaoke(&words, 0.0, "fill");
        assert!(result.contains("\\kf"), "expected \\kf tag, got: {result}");
    }
}
