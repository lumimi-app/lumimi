import { DEFAULTS, PRESETS } from "./config.js";

let deps = null;

export function buildPresetButtons() {
  const container = document.getElementById("preset-buttons");
  if (!container || !deps) return;
  const currentLang = deps.getCurrentLang();
  container.innerHTML = PRESETS.map((p) =>
    `<button class="btn-preset" data-preset="${p.id}" type="button">${currentLang === "ja" ? p.labelJa : p.label}</button>`
  ).join("");
}

export function setupPresets(options) {
  deps = options;
  buildPresetButtons();
  document.getElementById("preset-buttons").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-preset");
    if (!btn) return;
    const preset = PRESETS.find((p) => p.id === btn.dataset.preset);
    if (preset) applyPreset(preset);
  });
}

function normalizeFontName(name) {
  return String(name || "").toLowerCase().replace(/[\s_-]/g, "");
}

function selectPresetFont(preset) {
  const select = deps.inputs.fontName;
  const fontNames = [preset.fontName, ...(preset.fontFallbacks || [])].filter(Boolean);
  const options = [...select.options];
  const normalizedCandidates = fontNames.map(normalizeFontName);

  const exact = fontNames.find((name) =>
    options.some((option) => option.value === name)
  );
  if (exact) {
    select.value = exact;
    return;
  }

  const normalized = options.find((option) => {
    const optionName = normalizeFontName(option.value);
    return normalizedCandidates.some((candidate) =>
      optionName === candidate || optionName.includes(candidate) || candidate.includes(optionName)
    );
  });
  if (normalized) {
    select.value = normalized.value;
    return;
  }

  const opt = document.createElement("option");
  opt.value = preset.fontName;
  opt.textContent = preset.fontName;
  select.prepend(opt);
  select.value = preset.fontName;
}

function applyPreset(preset) {
  const { inputs } = deps;
  selectPresetFont(preset);
  inputs.fontBold.checked = preset.fontWeight !== 0;
  inputs.fontSize.value = preset.fontSize;
  inputs.highlightColor.value = preset.highlightColor;
  inputs.textColor.value = preset.textColor;
  inputs.highlightStyle.value = preset.highlightStyle;
  inputs.displayMode.value = preset.displayMode ?? DEFAULTS.displayMode;
  inputs.positionMode.value = preset.positionMode ?? DEFAULTS.positionMode;
  inputs.subtitleX.value = preset.subtitleX ?? DEFAULTS.subtitleX;
  inputs.subtitleY.value = preset.subtitleY ?? DEFAULTS.subtitleY;
  inputs.preShow.value = preset.preShowS ?? DEFAULTS.preShowS;
  inputs.holdS.value = preset.holdS ?? DEFAULTS.holdS;
  inputs.maxCharsPerLine.value = preset.maxCharsPerLine ?? DEFAULTS.maxCharsPerLine;
  inputs.maxSimultaneousLines.value = preset.maxSimultaneousLines ?? DEFAULTS.maxSimultaneousLines;
  inputs.vertical.checked = preset.vertical ?? DEFAULTS.vertical;

  deps.updatePositionControls();
  deps.updateColorPreview("highlight-preview", preset.highlightColor);
  deps.updateColorPreview("text-preview", preset.textColor);

  document.querySelectorAll(".btn-preset").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.preset === preset.id)
  );

  deps.saveSettings();
}
