import { DEFAULTS, PRESETS as DEFAULT_PRESETS } from "./config.js";
import { assToCss, cssToAss } from "./settings-ui.js";

const PRESET_STORAGE_KEY = "subtitlePresets";

let deps = null;
let presets = loadPresetList();
let activePresetId = null;

function clonePreset(preset) {
  return JSON.parse(JSON.stringify(preset));
}

function defaultPresetList() {
  return DEFAULT_PRESETS.map(clonePreset);
}

function loadPresetList() {
  const raw = localStorage.getItem(PRESET_STORAGE_KEY);
  if (!raw) return defaultPresetList();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall back to defaults if saved data is corrupt.
  }
  return defaultPresetList();
}

function savePresetList() {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPresetButtons() {
  const container = document.getElementById("preset-buttons");
  if (!container || !deps) return;
  const currentLang = deps.getCurrentLang();
  container.innerHTML = presets.map((p) =>
    `<button class="btn-preset" data-preset="${escapeHtml(p.id)}" type="button">${escapeHtml(currentLang === "ja" ? p.labelJa : p.label)}</button>`
  ).join("");
  document.querySelectorAll(".btn-preset").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.preset === activePresetId)
  );
}

export function setupPresets(options) {
  deps = options;
  buildPresetButtons();
  document.getElementById("preset-buttons").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-preset");
    if (!btn) return;
    const preset = presets.find((p) => p.id === btn.dataset.preset);
    if (preset) applyPreset(preset);
  });
  document.getElementById("settings-panel")?.addEventListener("input", clearActivePreset);
  document.getElementById("settings-panel")?.addEventListener("change", clearActivePreset);
  setupPresetManager();
}

function clearActivePreset(event) {
  if (event.target.closest("#preset-buttons") || event.target.closest("#preset-manage-overlay")) {
    return;
  }
  if (!activePresetId) return;
  activePresetId = null;
  buildPresetButtons();
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
  inputs.highlightColor.value = assToCss(preset.highlightColor);
  inputs.highlightColorCode.value = inputs.highlightColor.value.toLowerCase();
  inputs.textColor.value = assToCss(preset.textColor);
  inputs.textColorCode.value = inputs.textColor.value.toLowerCase();
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
  deps.updateColorPreview(inputs.highlightColor, inputs.highlightColor.value);
  deps.updateColorPreview(inputs.textColor, inputs.textColor.value);

  activePresetId = preset.id;
  buildPresetButtons();

  deps.saveSettings();
}

function setupPresetManager() {
  const openBtn = document.getElementById("btn-preset-manage");
  const overlay = document.getElementById("preset-manage-overlay");
  const menu = document.getElementById("preset-manager-menu");
  const panes = {
    add: document.getElementById("preset-pane-add"),
    edit: document.getElementById("preset-pane-edit"),
    delete: document.getElementById("preset-pane-delete"),
    restore: document.getElementById("preset-pane-restore"),
  };
  const addName = document.getElementById("preset-add-name");
  const editName = document.getElementById("preset-edit-name");
  const addForm = document.getElementById("preset-add-form");
  const editForm = document.getElementById("preset-edit-form");
  const editSelect = document.getElementById("preset-edit-select");
  const deleteSelect = document.getElementById("preset-delete-select");
  const restoreSelect = document.getElementById("preset-restore-select");
  const addBtn = document.getElementById("btn-preset-add");
  const updateBtn = document.getElementById("btn-preset-update");
  const deleteBtn = document.getElementById("btn-preset-delete");
  const restoreBtn = document.getElementById("btn-preset-restore");

  if (!openBtn || !overlay || !menu) return;

  const showMenu = () => {
    menu.style.display = "";
    Object.values(panes).forEach((pane) => {
      if (pane) pane.style.display = "none";
    });
  };

  const showPane = (mode) => {
    menu.style.display = "none";
    Object.entries(panes).forEach(([key, pane]) => {
      if (pane) pane.style.display = key === mode ? "" : "none";
    });
  };

  const openManager = () => {
    showMenu();
    overlay.style.display = "flex";
  };

  const closeManager = () => {
    overlay.style.display = "none";
  };

  openBtn.addEventListener("click", openManager);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeManager();
  });
  overlay.querySelectorAll("[data-preset-close]").forEach((btn) => {
    btn.addEventListener("click", closeManager);
  });

  document.getElementById("btn-preset-mode-add")?.addEventListener("click", () => {
    addName.value = "";
    renderPresetForm(addForm, "add", presetFromCurrentSettings({ id: "draft", labelJa: "", label: "" }));
    showPane("add");
    addName.focus();
  });

  document.getElementById("btn-preset-mode-edit")?.addEventListener("click", () => {
    refreshPresetSelect(editSelect, presets);
    loadEditPreset();
    showPane("edit");
  });

  document.getElementById("btn-preset-mode-delete")?.addEventListener("click", () => {
    refreshPresetSelect(deleteSelect, presets);
    showPane("delete");
  });

  document.getElementById("btn-preset-mode-restore")?.addEventListener("click", () => {
    refreshPresetSelect(restoreSelect, DEFAULT_PRESETS);
    showPane("restore");
  });

  const loadEditPreset = () => {
    const selected = presets.find((preset) => preset.id === editSelect.value) ?? presets[0];
    if (!selected) return;
    editSelect.value = selected.id;
    editName.value = selected.labelJa || selected.label || "";
    renderPresetForm(editForm, "edit", selected);
  };

  editSelect?.addEventListener("change", loadEditPreset);

  addBtn?.addEventListener("click", () => {
    const name = addName.value.trim() || addName.placeholder || "新規プリセット";
    const preset = presetFromForm("add", {
      id: newPresetId(),
      labelJa: name,
      label: name,
    });
    presets.push(preset);
    activePresetId = preset.id;
    savePresetList();
    buildPresetButtons();
    showMenu();
  });

  updateBtn?.addEventListener("click", () => {
    const index = presets.findIndex((preset) => preset.id === editSelect.value);
    if (index < 0) return;
    const current = presets[index];
    const name = editName.value.trim() || current.labelJa || current.label;
    presets[index] = presetFromForm("edit", {
      id: current.id,
      labelJa: name,
      label: name,
    });
    activePresetId = current.id;
    savePresetList();
    buildPresetButtons();
    refreshPresetSelect(editSelect, presets, current.id);
  });

  deleteBtn?.addEventListener("click", () => {
    const id = deleteSelect.value;
    presets = presets.filter((preset) => preset.id !== id);
    if (activePresetId === id) activePresetId = null;
    savePresetList();
    buildPresetButtons();
    refreshPresetSelect(deleteSelect, presets);
  });

  restoreBtn?.addEventListener("click", () => {
    const source = DEFAULT_PRESETS.find((preset) => preset.id === restoreSelect.value);
    if (!source) return;
    const restored = clonePreset(source);
    const index = presets.findIndex((preset) => preset.id === restored.id);
    if (index >= 0) {
      presets[index] = restored;
    } else {
      presets.push(restored);
    }
    if (activePresetId === restored.id) activePresetId = null;
    savePresetList();
    buildPresetButtons();
    refreshPresetSelect(restoreSelect, DEFAULT_PRESETS, restored.id);
  });
}

function newPresetId() {
  let id = `user_${Date.now()}`;
  while (presets.some((preset) => preset.id === id)) {
    id = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }
  return id;
}

function refreshPresetSelect(select, list, preferredId = select?.value) {
  if (!select) return;
  select.innerHTML = list
    .map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.labelJa || preset.label)}</option>`)
    .join("");
  const selected = list.find((preset) => preset.id === preferredId) ?? list[0];
  if (selected) select.value = selected.id;
}

function renderPresetForm(container, prefix, preset) {
  if (!container) return;
  const labels = presetFormLabels();
  container.innerHTML = `
    ${selectField(prefix, "fontName", labels.fontName, optionsFromSelect(deps.inputs.fontName, preset.fontName))}
    ${numberField(prefix, "fontSize", labels.fontSize, preset.fontSize, 40, 400, 10)}
    <div class="preset-inline-options">
      ${checkboxField(prefix, "fontBold", labels.fontBold, preset.fontWeight !== 0)}
      ${checkboxField(prefix, "vertical", labels.vertical, preset.vertical ?? DEFAULTS.vertical)}
    </div>
    ${selectField(prefix, "highlightStyle", labels.highlightStyle, optionsFromSelect(deps.inputs.highlightStyle, preset.highlightStyle))}
    ${selectField(prefix, "displayMode", labels.displayMode, optionsFromSelect(deps.inputs.displayMode, preset.displayMode ?? DEFAULTS.displayMode))}
    ${numberField(prefix, "maxCharsPerLine", labels.maxCharsPerLine, preset.maxCharsPerLine ?? DEFAULTS.maxCharsPerLine, 5, 100, 1)}
    ${selectField(prefix, "maxSimultaneousLines", labels.maxSimultaneousLines, optionsFromSelect(deps.inputs.maxSimultaneousLines, preset.maxSimultaneousLines ?? DEFAULTS.maxSimultaneousLines))}
    ${selectField(prefix, "positionMode", labels.positionMode, optionsFromSelect(deps.inputs.positionMode, preset.positionMode ?? DEFAULTS.positionMode))}
    ${numberField(prefix, "subtitleX", labels.subtitleX, preset.subtitleX ?? DEFAULTS.subtitleX, 0, 100, 1)}
    ${numberField(prefix, "subtitleY", labels.subtitleY, preset.subtitleY ?? DEFAULTS.subtitleY, 0, 100, 1)}
    ${colorField(prefix, "highlightColor", labels.highlightColor, preset.highlightColor)}
    ${colorField(prefix, "textColor", labels.textColor, preset.textColor)}
    ${numberField(prefix, "preShowS", labels.preShowS, preset.preShowS ?? DEFAULTS.preShowS, 0, 3, 0.05)}
    ${numberField(prefix, "holdS", labels.holdS, preset.holdS ?? DEFAULTS.holdS, 0, 3, 0.05)}
  `;
  attachPresetColorSync(prefix, "highlightColor");
  attachPresetColorSync(prefix, "textColor");
}

function presetFormLabels() {
  const ja = deps.getCurrentLang() === "ja";
  return {
    fontName: ja ? "フォント名" : "Font",
    fontSize: ja ? "フォントサイズ" : "Font Size",
    fontBold: ja ? "太字" : "Bold",
    vertical: ja ? "縦書き" : "Vertical",
    highlightStyle: ja ? "演出スタイル" : "Effect Style",
    displayMode: ja ? "表示モード" : "Display Mode",
    maxCharsPerLine: ja ? "1行の最大文字数" : "Max chars per line",
    maxSimultaneousLines: ja ? "同時表示行数" : "Simultaneous lines",
    positionMode: ja ? "字幕位置" : "Subtitle Position",
    subtitleX: ja ? "横位置" : "Horizontal",
    subtitleY: ja ? "縦位置" : "Vertical position",
    highlightColor: ja ? "ハイライト色" : "Highlight Color",
    textColor: ja ? "文字色" : "Text Color",
    preShowS: ja ? "先行表示 秒" : "Pre-show seconds",
    holdS: ja ? "表示保持 秒" : "Hold seconds",
  };
}

function optionsFromSelect(select, selectedValue) {
  const selected = String(selectedValue ?? "");
  const options = [...select.options].map((option) => ({
    value: option.value,
    label: option.textContent,
    selected: option.value === selected,
  }));
  if (selected && !options.some((option) => option.value === selected)) {
    options.unshift({
      value: selected,
      label: selected,
      selected: true,
    });
  }
  return options
    .map((option) => ({
      ...option,
      selected: option.selected || (!selected && option.value === select.value),
    }))
    .map((option) =>
      `<option value="${escapeHtml(option.value)}"${option.selected ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("");
}

function fieldId(prefix, key) {
  return `preset-${prefix}-${key}`;
}

function selectField(prefix, key, label, options) {
  return `
    <label class="preset-manager-field">
      <span>${escapeHtml(label)}</span>
      <select id="${fieldId(prefix, key)}">${options}</select>
    </label>
  `;
}

function numberField(prefix, key, label, value, min, max, step) {
  return `
    <label class="preset-manager-field">
      <span>${escapeHtml(label)}</span>
      <input type="number" id="${fieldId(prefix, key)}" value="${escapeHtml(value)}" min="${min}" max="${max}" step="${step}" />
    </label>
  `;
}

function textField(prefix, key, label, value) {
  return `
    <label class="preset-manager-field">
      <span>${escapeHtml(label)}</span>
      <input type="text" id="${fieldId(prefix, key)}" value="${escapeHtml(value)}" />
    </label>
  `;
}

function colorField(prefix, key, label, value) {
  const cssColor = assToCss(value).toLowerCase();
  return `
    <label class="preset-manager-field">
      <span>${escapeHtml(label)}</span>
      <span class="preset-color-control">
        <input type="color" id="${fieldId(prefix, key)}" value="${escapeHtml(cssColor)}" />
        <input type="text" class="color-code-input" id="${fieldId(prefix, `${key}Code`)}" value="${escapeHtml(cssColor)}" maxlength="7" placeholder="#ffffff" />
      </span>
    </label>
  `;
}

function attachPresetColorSync(prefix, key) {
  const picker = document.getElementById(fieldId(prefix, key));
  const codeInput = document.getElementById(fieldId(prefix, `${key}Code`));
  if (!picker || !codeInput) return;

  picker.addEventListener("input", () => {
    codeInput.value = picker.value.toLowerCase();
    codeInput.classList.remove("is-invalid");
  });
  codeInput.addEventListener("input", () => {
    const valid = /^#[0-9a-fA-F]{6}$/.test(codeInput.value.trim());
    codeInput.classList.toggle("is-invalid", !valid);
    if (valid) picker.value = codeInput.value.trim().toLowerCase();
  });
  codeInput.addEventListener("change", () => {
    const cssColor = assToCss(codeInput.value).toLowerCase();
    picker.value = cssColor;
    codeInput.value = cssColor;
    codeInput.classList.remove("is-invalid");
  });
}

function checkboxField(prefix, key, label, checked) {
  return `
    <label class="checkbox-item preset-checkbox">
      <input type="checkbox" id="${fieldId(prefix, key)}"${checked ? " checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function formValue(prefix, key) {
  return document.getElementById(fieldId(prefix, key))?.value;
}

function formChecked(prefix, key) {
  return document.getElementById(fieldId(prefix, key))?.checked ?? false;
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function presetFromForm(prefix, base) {
  return {
    ...base,
    fontName: formValue(prefix, "fontName"),
    fontWeight: formChecked(prefix, "fontBold") ? -1 : 0,
    fontSize: numberOrDefault(formValue(prefix, "fontSize"), DEFAULTS.fontSize),
    highlightColor: cssToAss(formValue(prefix, "highlightColorCode")),
    textColor: cssToAss(formValue(prefix, "textColorCode")),
    highlightStyle: formValue(prefix, "highlightStyle") || DEFAULTS.highlightStyle,
    displayMode: formValue(prefix, "displayMode") || DEFAULTS.displayMode,
    positionMode: formValue(prefix, "positionMode") || DEFAULTS.positionMode,
    subtitleX: numberOrDefault(formValue(prefix, "subtitleX"), DEFAULTS.subtitleX),
    subtitleY: numberOrDefault(formValue(prefix, "subtitleY"), DEFAULTS.subtitleY),
    preShowS: numberOrDefault(formValue(prefix, "preShowS"), DEFAULTS.preShowS),
    holdS: numberOrDefault(formValue(prefix, "holdS"), DEFAULTS.holdS),
    maxCharsPerLine: numberOrDefault(formValue(prefix, "maxCharsPerLine"), DEFAULTS.maxCharsPerLine),
    maxSimultaneousLines: numberOrDefault(formValue(prefix, "maxSimultaneousLines"), DEFAULTS.maxSimultaneousLines),
    vertical: formChecked(prefix, "vertical"),
  };
}

function presetFromCurrentSettings(base) {
  const settings = deps.getSettings();
  return {
    ...base,
    fontName: settings.font_name,
    fontWeight: settings.font_weight,
    fontSize: settings.font_size,
    highlightColor: settings.highlight_color,
    textColor: settings.text_color,
    highlightStyle: settings.highlight_style,
    displayMode: settings.display_mode,
    positionMode: settings.position_mode,
    subtitleX: settings.subtitle_x_pct,
    subtitleY: settings.subtitle_y_pct,
    preShowS: settings.pre_show_s,
    holdS: settings.hold_s,
    maxCharsPerLine: settings.max_chars_per_line,
    maxSimultaneousLines: settings.max_simultaneous_lines,
    vertical: settings.vertical,
  };
}
