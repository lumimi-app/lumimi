const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

import { STRINGS } from "./config.js";
import { loadDict, renderDictList, setupDict } from "./dict-ui.js";
import { setupLicenseModal } from "./license-ui.js";
import { setupPanelResizer } from "./panel-resizer.js";
import { buildPresetButtons, setupPresets } from "./preset-ui.js";
import { clearPreviewThumbnail, initPreview, setPreviewAspect, setPreviewThumbnail } from "./preview.js";
import { ensureDefaultModel, loadFontList, loadModelList } from "./resource-ui.js";
import {
  assToCss,
  getSettings,
  initSettingsUi,
  loadSettings,
  saveSettings,
  setupColorPreviews,
  updateColorPreview,
  updateOutputTypeVisibility,
  updatePositionControls,
} from "./settings-ui.js";
import { setupVideoUi } from "./video-ui.js";

let currentLang = "ja";
let selectedVideoPath = null;
let selectedOutputDir = null;
let lastOutputPath = null;
let isProcessing = false;
let cancelRequested = false;
const tauriUnlisteners = [];

const dropZone = document.getElementById("drop-zone");
const fileNameEl = document.getElementById("file-name");
const settingsPanel = document.getElementById("settings-panel");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const statusEl = document.getElementById("status");
const btnGenerate = document.getElementById("btn-generate");
const btnOpenFolder = document.getElementById("btn-open-folder");
const cancelConfirmOverlay = document.getElementById("cancel-confirm-overlay");
const cancelConfirmTitle = document.getElementById("cancel-confirm-title");
const cancelConfirmMessage = document.getElementById("cancel-confirm-message");
const btnCancelYes = document.getElementById("btn-cancel-yes");
const btnCancelNo = document.getElementById("btn-cancel-no");
const outputConflictOverlay = document.getElementById("output-conflict-overlay");
const outputConflictTitle = document.getElementById("output-conflict-title");
const outputConflictMessage = document.getElementById("output-conflict-message");
const btnOutputRename = document.getElementById("btn-output-rename");
const btnOutputOverwrite = document.getElementById("btn-output-overwrite");
const btnOutputCancel = document.getElementById("btn-output-cancel");

const modelSelect = document.getElementById("model-select");
const languageSelect = document.getElementById("language-select");
const outputFormatSelect = document.getElementById("output-format");
const outputTypeSelect = document.getElementById("output-type");
const outputFormatRow = document.getElementById("output-format-row");
const subtitleFormatsRow = document.getElementById("subtitle-formats-row");
const fmtSrt = document.getElementById("fmt-srt");
const fmtVtt = document.getElementById("fmt-vtt");
const fmtTxt = document.getElementById("fmt-txt");
const outputFolderPath = document.getElementById("output-folder-path");
const btnSelectOutputFolder = document.getElementById("btn-select-output-folder");
const outputFilenameInput = document.getElementById("output-filename");

const inputs = {
  fontName: document.getElementById("font-name"),
  fontSize: document.getElementById("font-size"),
  highlightColor: document.getElementById("highlight-color"),
  highlightColorCode: document.getElementById("highlight-color-code"),
  textColor: document.getElementById("text-color"),
  textColorCode: document.getElementById("text-color-code"),
  preShow: document.getElementById("pre-show"),
  initialPrompt: document.getElementById("initial-prompt"),
  maxCharsPerLine: document.getElementById("max-chars-per-line"),
  fontBold: document.getElementById("font-bold"),
  highlightStyle: document.getElementById("highlight-style"),
  displayMode: document.getElementById("display-mode"),
  positionMode: document.getElementById("position-mode"),
  subtitleX: document.getElementById("subtitle-x"),
  subtitleY: document.getElementById("subtitle-y"),
  holdS: document.getElementById("hold-s"),
  maxSimultaneousLines: document.getElementById("max-simultaneous-lines"),
  vertical: document.getElementById("vertical"),
  bilingual: document.getElementById("bilingual"),
};

async function addTauriListener(event, handler) {
  try {
    const unlisten = await listen(event, handler);
    tauriUnlisteners.push(unlisten);
    return unlisten;
  } catch (err) {
    console.warn(`Failed to listen for ${event}`, err);
    return null;
  }
}

window.addEventListener("beforeunload", () => {
  while (tauriUnlisteners.length) {
    const unlisten = tauriUnlisteners.pop();
    try {
      unlisten();
    } catch {
      // Ignore cleanup errors during page teardown.
    }
  }
});

function setupFontButtons() {
  const minus = document.getElementById("font-minus");
  const plus = document.getElementById("font-plus");

  if (!minus || !plus) return;

  const setFontSize = (next) => {
    inputs.fontSize.value = String(Math.min(400, Math.max(40, next)));
    inputs.fontSize.dispatchEvent(new Event("change", { bubbles: true }));
  };

  minus.addEventListener("click", () => {
    const current = parseInt(inputs.fontSize.value || 100, 10);
    setFontSize(current - 10);
  });

  plus.addEventListener("click", () => {
    const current = parseInt(inputs.fontSize.value || 100, 10);
    setFontSize(current + 10);
  });
}

async function init() {
  applyLanguage(localStorage.getItem("lang") || "ja");
  setupPanelResizer();
  initSettingsUi({
    fmtSrt,
    fmtTxt,
    fmtVtt,
    getSelectedOutputDir: () => selectedOutputDir,
    inputs,
    languageSelect,
    modelSelect,
    outputFolderPath,
    outputFormatRow,
    outputFormatSelect,
    outputTypeSelect,
    setSelectedOutputDir: (dir) => { selectedOutputDir = dir; },
    subtitleFormatsRow,
  });
  loadSettings();
  setupVideoUi({
    open,
    invoke,
    addTauriListener,
    getIsProcessing: () => isProcessing,
    getCurrentLang: () => currentLang,
    setSelectedVideoPath: (p) => { selectedVideoPath = p; },
    setLastOutputPath: (p) => { lastOutputPath = p; },
    setSelectedOutputDir: (dir) => { selectedOutputDir = dir; },
    updateGenerateButton,
    clearPreviewThumbnail,
    setPreviewThumbnail,
    saveSettings,
    dropZone,
    fileNameEl,
    statusEl,
    btnOpenFolder,
    outputFilenameInput,
    outputFolderPath,
    btnSelectOutputFolder,
  });
  setupColorPreviews();
  setupButtons();
  setupPresets({
    inputs,
    getCurrentLang: () => currentLang,
    getSettings,
    saveSettings,
    updateColorPreview,
    updatePositionControls,
  });
  setupLicenseModal({ getCurrentLang: () => currentLang });
  setupDict({ getCurrentLang: () => currentLang });
  initPreview({ getSettings, assToCss, getCurrentLang: () => currentLang });
  listenProgress();
  await ensureDefaultModel();
  await Promise.allSettled([
    loadModelList({ modelSelect, getCurrentLang: () => currentLang, saveSettings }),
    loadFontList({ fontSelect: inputs.fontName }),
    loadDict(),
  ]);
  setupFontButtons();
}

function applyLanguage(lang) {
  currentLang = lang;
  const s = STRINGS[lang];
  localStorage.setItem("lang", lang);

  document.getElementById("lang-toggle").textContent = s.switchLang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (s[key] !== undefined) el.textContent = s[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (s[key] !== undefined) el.placeholder = s[key];
  });

  document.getElementById("initial-prompt").placeholder = s.promptPlaceholder;
  const dictFrom = document.getElementById("dict-from");
  if (dictFrom) dictFrom.placeholder = s.dictFromPlaceholder;
  const dictTo = document.getElementById("dict-to");
  if (dictTo) dictTo.placeholder = s.dictToPlaceholder;

  // Rebuild preset buttons so section label updates
  buildPresetButtons();
  updatePreviewExpandButton();
  renderDictList();

  // Restore dynamic text that data-i18n may have overwritten
  if (selectedVideoPath) {
    dropZone.querySelector(".label").textContent = s.dropChange;
  }
  if (selectedOutputDir) {
    outputFolderPath.textContent =
      selectedOutputDir.replace(/\\/g, "/").split("/").pop() || selectedOutputDir;
  }
  updateGenerateButton();
  updateCancelConfirmText();
  updateOutputConflictText();
}

function listenProgress() {
  addTauriListener("progress", (event) => {
    const { step, progress } = event.payload;
    progressFill.style.width = `${progress * 100}%`;
    const s = STRINGS[currentLang];
    const stepLabels = {
      audio: s.stepAudio,
      transcribe: s.stepTranscribe,
      translate: s.stepTranslate,
      subtitle: s.stepSubtitle,
      render: s.stepRender,
      done: s.stepDone,
    };
    progressLabel.textContent = stepLabels[step] || step;
  });
}

function setupButtons() {
  btnGenerate.addEventListener("click", () => {
    if (isProcessing) {
      showCancelConfirm();
    } else {
      generate();
    }
  });
  btnCancelNo?.addEventListener("click", hideCancelConfirm);
  btnCancelYes?.addEventListener("click", requestCancelGeneration);
  cancelConfirmOverlay?.addEventListener("click", (event) => {
    if (event.target === cancelConfirmOverlay) hideCancelConfirm();
  });
  btnOpenFolder.addEventListener("click", async () => {
    if (lastOutputPath) {
      await invoke("open_folder", { path: lastOutputPath });
    }
  });
  document.getElementById("lang-toggle").addEventListener("click", () => {
    const newLang = currentLang === "ja" ? "en" : "ja";
    applyLanguage(newLang);
    loadModelList({ modelSelect, getCurrentLang: () => currentLang, saveSettings });
  });

  outputTypeSelect.addEventListener("change", updateOutputTypeVisibility);

  document.querySelector(".preview-expand")?.addEventListener("click", () => {
    document.querySelector(".preview-card")?.classList.toggle("expanded");
    updatePreviewExpandButton();
  });

  document.querySelectorAll(".preview-aspect-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPreviewAspect(btn.dataset.previewAspect);
    });
  });
}

function updateGenerateButton() {
  const s = STRINGS[currentLang];
  if (cancelRequested) {
    btnGenerate.textContent = s.cancelling;
    btnGenerate.disabled = true;
  } else if (isProcessing) {
    btnGenerate.textContent = s.cancelGenerate;
    btnGenerate.disabled = false;
  } else {
    btnGenerate.textContent = s.generate;
    btnGenerate.disabled = !selectedVideoPath;
  }
}

function updateCancelConfirmText() {
  const s = STRINGS[currentLang];
  if (cancelConfirmTitle) cancelConfirmTitle.textContent = s.cancelConfirmTitle;
  if (cancelConfirmMessage) cancelConfirmMessage.textContent = s.cancelConfirmMessage;
  if (btnCancelYes) btnCancelYes.textContent = s.cancelConfirmYes;
  if (btnCancelNo) btnCancelNo.textContent = s.cancelConfirmNo;
}

function updateOutputConflictText() {
  const s = STRINGS[currentLang];
  if (outputConflictTitle) outputConflictTitle.textContent = s.outputConflictTitle;
  if (btnOutputRename) btnOutputRename.textContent = s.outputConflictRename;
  if (btnOutputOverwrite) btnOutputOverwrite.textContent = s.outputConflictOverwrite;
  if (btnOutputCancel) btnOutputCancel.textContent = s.outputConflictCancel;
}

function showCancelConfirm() {
  if (!isProcessing || cancelRequested || !cancelConfirmOverlay) return;
  updateCancelConfirmText();
  cancelConfirmOverlay.style.display = "flex";
}

function hideCancelConfirm() {
  if (cancelConfirmOverlay) cancelConfirmOverlay.style.display = "none";
}

function showOutputConflict(conflicts) {
  if (!outputConflictOverlay) return Promise.resolve("cancel");
  const s = STRINGS[currentLang];
  updateOutputConflictText();

  const names = conflicts.map((conflict) => conflict.name || conflict.path).filter(Boolean);
  const shown = names.slice(0, 4);
  const more = Math.max(0, names.length - shown.length);
  const moreText = more > 0
    ? `\n${s.outputConflictMore.replace("{count}", String(more))}`
    : "";
  outputConflictMessage.textContent = `${s.outputConflictMessage}\n\n${shown.join("\n")}${moreText}`;
  outputConflictOverlay.style.display = "flex";

  return new Promise((resolve) => {
    const finish = (value) => {
      hideOutputConflict();
      btnOutputRename?.removeEventListener("click", onRename);
      btnOutputOverwrite?.removeEventListener("click", onOverwrite);
      btnOutputCancel?.removeEventListener("click", onCancel);
      resolve(value);
    };
    const onRename = () => finish("rename");
    const onOverwrite = () => finish("overwrite");
    const onCancel = () => finish("cancel");

    btnOutputRename?.addEventListener("click", onRename);
    btnOutputOverwrite?.addEventListener("click", onOverwrite);
    btnOutputCancel?.addEventListener("click", onCancel);
  });
}

function hideOutputConflict() {
  if (outputConflictOverlay) outputConflictOverlay.style.display = "none";
}

async function requestCancelGeneration() {
  if (!isProcessing || cancelRequested) return;
  hideCancelConfirm();
  cancelRequested = true;
  updateGenerateButton();
  progressLabel.textContent = STRINGS[currentLang].cancelling;
  try {
    await invoke("cancel_generation");
  } catch (err) {
    cancelRequested = false;
    updateGenerateButton();
    statusEl.textContent = `${STRINGS[currentLang].errorPrefix}${err}`;
    statusEl.className = "status error";
  }
}

function updatePreviewExpandButton() {
  const btn = document.querySelector(".preview-expand");
  const previewCard = document.querySelector(".preview-card");
  if (!btn || !previewCard) return;
  const s = STRINGS[currentLang];
  btn.textContent = previewCard.classList.contains("expanded")
    ? s.previewCollapse
    : s.previewExpand;
}

async function generate() {
  if (!selectedVideoPath || isProcessing) return;

  saveSettings();
  const customName = outputFilenameInput.value.trim();
  const settings = getSettings();
  let outputConflictAction = "overwrite";

  try {
    const conflicts = await invoke("preview_output_conflicts", {
      videoPath: selectedVideoPath,
      settings,
      outputDir: selectedOutputDir ?? null,
      outputFilename: customName || null,
    });
    if (conflicts.length > 0) {
      outputConflictAction = await showOutputConflict(conflicts);
      if (outputConflictAction === "cancel") return;
    }
  } catch (err) {
    statusEl.textContent = `${STRINGS[currentLang].errorPrefix}${err}`;
    statusEl.className = "status error";
    return;
  }

  isProcessing = true;
  cancelRequested = false;
  updateGenerateButton();
  btnOpenFolder.style.display = "none";
  statusEl.textContent = "";
  statusEl.className = "status";
  progressFill.style.width = "0%";
  progressLabel.textContent = STRINGS[currentLang].stepStarting;
  try {
    const outputPath = await invoke("generate_subtitles", {
      videoPath: selectedVideoPath,
      settings,
      outputDir: selectedOutputDir ?? null,
      outputFilename: customName || null,
      outputConflictAction,
    });

    lastOutputPath = outputPath;
    statusEl.textContent = STRINGS[currentLang].statusSuccess;
    statusEl.className = "status success";
    btnOpenFolder.style.display = "block";
  } catch (err) {
    const message = String(err);
    progressLabel.textContent = "";
    if (message.includes("Generation cancelled")) {
      statusEl.textContent = STRINGS[currentLang].statusCancelled;
      statusEl.className = "status";
    } else {
      statusEl.textContent = `${STRINGS[currentLang].errorPrefix}${message}`;
      statusEl.className = "status error";
    }
    progressFill.style.width = "0%";
  } finally {
    isProcessing = false;
    cancelRequested = false;
    hideCancelConfirm();
    hideOutputConflict();
    updateGenerateButton();
  }
}

window.addEventListener("DOMContentLoaded", init);
