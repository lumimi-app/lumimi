import { DEFAULTS } from "./config.js";

let deps = null;

export function initSettingsUi(options) {
  deps = options;
}

export function loadSettings() {
  const {
    fmtSrt,
    fmtTxt,
    fmtVtt,
    inputs,
    languageSelect,
    outputFolderPath,
    outputFormatSelect,
    outputTypeSelect,
    setSelectedOutputDir,
  } = deps;
  const saved = JSON.parse(localStorage.getItem("settings") || "{}");
  const s = { ...DEFAULTS, ...saved };

  if (saved.outputDir) {
    setSelectedOutputDir(saved.outputDir);
    outputFolderPath.textContent =
      saved.outputDir.replace(/\\/g, "/").split("/").pop() || saved.outputDir;
  }

  inputs.fontSize.value = s.fontSize;
  inputs.highlightColor.value = assToCss(s.highlightColor ?? s.highlight_color);
  inputs.highlightColorCode.value = inputs.highlightColor.value.toLowerCase();
  inputs.textColor.value = assToCss(s.textColor ?? s.text_color);
  inputs.textColorCode.value = inputs.textColor.value.toLowerCase();
  inputs.preShow.value = s.preShowS;
  inputs.holdS.value = s.holdS ?? 0.5;
  inputs.maxSimultaneousLines.value = String(s.maxSimultaneousLines ?? 2);
  inputs.vertical.checked = s.vertical ?? false;
  inputs.initialPrompt.value = s.initialPrompt ?? "";
  inputs.maxCharsPerLine.value = s.maxCharsPerLine;
  inputs.displayMode.value = normalizeDisplayMode(
    s.displayMode ?? s.display_mode ?? (s.stacking ? "stacking" : "normal")
  );
  inputs.positionMode.value = s.positionMode ?? s.position_mode ?? "auto";
  if (!inputs.positionMode.value) inputs.positionMode.value = "auto";
  inputs.subtitleX.value = s.subtitleX ?? s.subtitle_x_pct ?? 50;
  inputs.subtitleY.value = s.subtitleY ?? s.subtitle_y_pct ?? 85;
  updatePositionControls();
  languageSelect.value = s.language ?? "ja";
  if (!languageSelect.value) languageSelect.value = "ja";
  outputFormatSelect.value = s.outputFormat ?? s.output_format ?? "mp4";
  if (!outputFormatSelect.value) outputFormatSelect.value = "mp4";
  outputTypeSelect.value = s.outputType ?? s.output_type ?? "video";
  if (!outputTypeSelect.value) outputTypeSelect.value = "video";
  const savedFmts = s.subtitleFormats ?? s.subtitle_formats ?? ["srt"];
  fmtSrt.checked = savedFmts.includes("srt");
  fmtVtt.checked = savedFmts.includes("vtt");
  fmtTxt.checked = savedFmts.includes("txt");
  updateOutputTypeVisibility();

  // Migrate from old bold:bool or numeric fontWeight -> true/false
  const raw = s.fontWeight ?? (s.bold ? -1 : 0);
  inputs.fontBold.checked = raw !== 0;
  inputs.highlightStyle.value = s.highlightStyle ?? "color";

  updateColorPreview(inputs.highlightColor, inputs.highlightColor.value);
  updateColorPreview(inputs.textColor, inputs.textColor.value);
}

export function saveSettings() {
  const data = { ...getSettings() };
  const selectedOutputDir = deps.getSelectedOutputDir();
  if (selectedOutputDir) data.outputDir = selectedOutputDir;
  localStorage.setItem("settings", JSON.stringify(data));
}

export function getSettings() {
  const {
    fmtSrt,
    fmtTxt,
    fmtVtt,
    inputs,
    languageSelect,
    modelSelect,
    outputFormatSelect,
    outputTypeSelect,
  } = deps;
  const displayMode = normalizeDisplayMode(inputs.displayMode.value);
  const subtitleX = parseFloat(inputs.subtitleX.value);
  const subtitleY = parseFloat(inputs.subtitleY.value);
  return {
    model_path: modelSelect.value || "models/ggml-medium.bin",
    font_name: inputs.fontName.value,
    font_size: parseInt(inputs.fontSize.value, 10),
    highlight_color: cssToAss(inputs.highlightColor.value),
    text_color: cssToAss(inputs.textColor.value),
    pre_show_s: parseFloat(inputs.preShow.value),
    hold_s: parseFloat(inputs.holdS.value) || 0,
    max_simultaneous_lines: parseInt(inputs.maxSimultaneousLines.value, 10) || 1,
    vertical: inputs.vertical.checked,
    bilingual: inputs.bilingual.checked,
    stacking: displayMode === "stacking",
    initial_prompt: inputs.initialPrompt.value,
    max_chars_per_line: parseInt(inputs.maxCharsPerLine.value, 10) || 0,
    font_weight: inputs.fontBold.checked ? -1 : 0,
    highlight_style: inputs.highlightStyle.value,
    display_mode: displayMode,
    position_mode: inputs.positionMode.value || "auto",
    subtitle_x_pct: Number.isFinite(subtitleX) ? subtitleX : 50,
    subtitle_y_pct: Number.isFinite(subtitleY) ? subtitleY : 85,
    language: languageSelect.value || "ja",
    output_format: outputFormatSelect.value || "mp4",
    output_type: outputTypeSelect.value || "video",
    subtitle_formats: [
      ...(fmtSrt.checked ? ["srt"] : []),
      ...(fmtVtt.checked ? ["vtt"] : []),
      ...(fmtTxt.checked ? ["txt"] : []),
    ],
    play_res_x: 1920,
    play_res_y: 1080,
    margin_v: 30,
  };
}

export function assToCss(assColor) {
  const value = String(assColor || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  const hex = value
    .replace(/^&H/i, "")
    .replace(/&$/, "");
  if (hex.length >= 8) {
    const bb = hex.slice(2, 4);
    const gg = hex.slice(4, 6);
    const rr = hex.slice(6, 8);
    return `#${rr}${gg}${bb}`;
  }
  return "#ffffff";
}

export function cssToAss(cssColor) {
  const hex = String(cssColor || "")
    .trim()
    .replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "&H00FFFFFF&";
  const rr = hex.slice(0, 2);
  const gg = hex.slice(2, 4);
  const bb = hex.slice(4, 6);
  return `&H00${bb}${gg}${rr}&`.toUpperCase();
}

export function normalizeCssColor(color) {
  const value = String(color || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return assToCss(value);
}

export function updateColorPreview(target, color) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  const cssColor = normalizeCssColor(color);
  if (!el) return cssColor;
  if (el.matches?.('input[type="color"]')) {
    el.value = cssColor;
  } else {
    el.style.background = cssColor;
  }
  return cssColor;
}

export function updateOutputTypeVisibility() {
  const t = deps.outputTypeSelect.value;
  deps.outputFormatRow.style.display = t === "subtitle" ? "none" : "";
  deps.subtitleFormatsRow.style.display = t === "video" ? "none" : "";
}

function normalizeDisplayMode(mode) {
  return mode === "single_word" ? "word_popup" : (mode || "normal");
}

export function updatePositionControls() {
  const { inputs } = deps;
  const manual = inputs.positionMode.value === "manual";
  document.getElementById("position-x-row")?.classList.toggle("is-hidden", !manual);
  document.getElementById("position-y-row")?.classList.toggle("is-hidden", !manual);
  document.getElementById("subtitle-x-value").textContent = `${inputs.subtitleX.value}%`;
  document.getElementById("subtitle-y-value").textContent = `${inputs.subtitleY.value}%`;
}

export function setupColorPreviews() {
  const { inputs } = deps;

  const syncPickerToCode = (picker, codeInput) => {
    const cssColor = updateColorPreview(picker, picker.value);
    codeInput.value = cssColor;
    saveSettings();
  };

  const syncCodeToPicker = (picker, codeInput) => {
    const cssColor = normalizeCssColor(codeInput.value);
    if (!/^#[0-9a-fA-F]{6}$/.test(codeInput.value.trim())) {
      codeInput.value = cssColor;
    }
    updateColorPreview(picker, cssColor);
    codeInput.classList.remove("is-invalid");
    saveSettings();
  };

  const markCodeValidity = (codeInput) => {
    const valid = /^#[0-9a-fA-F]{6}$/.test(codeInput.value.trim());
    codeInput.classList.toggle("is-invalid", !valid);
    return valid;
  };

  inputs.highlightColor.addEventListener("input", () => {
    syncPickerToCode(inputs.highlightColor, inputs.highlightColorCode);
  });
  inputs.textColor.addEventListener("input", () => {
    syncPickerToCode(inputs.textColor, inputs.textColorCode);
  });
  inputs.highlightColorCode.addEventListener("input", () => {
    if (markCodeValidity(inputs.highlightColorCode)) {
      syncCodeToPicker(inputs.highlightColor, inputs.highlightColorCode);
    }
  });
  inputs.textColorCode.addEventListener("input", () => {
    if (markCodeValidity(inputs.textColorCode)) {
      syncCodeToPicker(inputs.textColor, inputs.textColorCode);
    }
  });
  inputs.highlightColorCode.addEventListener("change", () => {
    syncCodeToPicker(inputs.highlightColor, inputs.highlightColorCode);
  });
  inputs.textColorCode.addEventListener("change", () => {
    syncCodeToPicker(inputs.textColor, inputs.textColorCode);
  });
  [inputs.positionMode, inputs.subtitleX, inputs.subtitleY].forEach((el) => {
    el.addEventListener("input", () => {
      updatePositionControls();
      saveSettings();
    });
  });
  Object.values(inputs).forEach((el) => {
    el.addEventListener("change", () => {
      updatePositionControls();
      document.querySelectorAll(".btn-preset").forEach((btn) => btn.classList.remove("active"));
      saveSettings();
    });
  });
}
