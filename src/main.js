const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

import { STRINGS } from "./config.js";
import { loadDict, renderDictList, setupDict } from "./dict-ui.js";
import { setupLicenseModal } from "./license-ui.js";
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

let currentLang = "ja";
let selectedVideoPath = null;
let selectedOutputDir = null;
let lastOutputPath = null;
let isProcessing = false;
const tauriUnlisteners = [];

const dropZone = document.getElementById("drop-zone");
const fileNameEl = document.getElementById("file-name");
const settingsPanel = document.getElementById("settings-panel");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const statusEl = document.getElementById("status");
const btnGenerate = document.getElementById("btn-generate");
const btnOpenFolder = document.getElementById("btn-open-folder");

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
  textColor: document.getElementById("text-color"),
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
  setupDropZone();
  setupColorPreviews();
  setupOutputFolder();
  setupButtons();
  setupPresets({
    inputs,
    getCurrentLang: () => currentLang,
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

function setupPanelResizer() {
  const app = document.querySelector(".app");
  const resizer = document.getElementById("panel-resizer");
  if (!app || !resizer) return;

  const clampWidth = (clientX) => {
    const rect = app.getBoundingClientRect();
    const minLeft = 280;
    const minRight = 520;
    const maxLeft = Math.max(minLeft, rect.width - minRight);
    return Math.round(Math.min(maxLeft, Math.max(minLeft, clientX - rect.left)));
  };

  const clampPanelWidth = (width) => {
    const rect = app.getBoundingClientRect();
    const minLeft = 280;
    const minRight = 520;
    const maxLeft = Math.max(minLeft, rect.width - minRight);
    return Math.round(Math.min(maxLeft, Math.max(minLeft, width)));
  };

  const saved = parseInt(localStorage.getItem("leftPanelWidth") || "", 10);
  if (Number.isFinite(saved)) {
    app.style.setProperty("--left-panel-width", `${clampPanelWidth(saved)}px`);
  }

  const onPointerMove = (event) => {
    const width = clampWidth(event.clientX);
    app.style.setProperty("--left-panel-width", `${width}px`);
  };

  const stopResize = (event) => {
    const width = clampWidth(event.clientX);
    localStorage.setItem("leftPanelWidth", String(width));
    app.classList.remove("resizing");
    document.body.classList.remove("panel-resizing");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopResize);
  };

  resizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    app.classList.add("resizing");
    document.body.classList.add("panel-resizing");
    resizer.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
  });
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
}

function setupDropZone() {
  dropZone.addEventListener("click", async () => {
    if (isProcessing) return;
    const path = await open({
      multiple: false,
      filters: [
        { name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "webm"] },
      ],
    });
    if (path) setVideoPath(path);
  });

  addTauriListener("tauri://drag-enter", () => dropZone.classList.add("drag-over"));
  addTauriListener("tauri://drag-leave", () => dropZone.classList.remove("drag-over"));
  addTauriListener("tauri://drag-drop", (event) => {
    dropZone.classList.remove("drag-over");
    if (isProcessing) return;
    const paths = event.payload?.paths;
    if (paths && paths.length > 0) setVideoPath(paths[0]);
  });
}

function setVideoPath(path) {
  selectedVideoPath = path;

  const name = path.replace(/\\/g, "/").split("/").pop();
  const stem = name.replace(/\.[^.]+$/, "");

  fileNameEl.textContent = name;
  fileNameEl.style.display = "block";

  dropZone.classList.add("has-file");
  dropZone.querySelector(".label").textContent = STRINGS[currentLang].dropChange;

  btnGenerate.disabled = false;

  statusEl.textContent = "";
  statusEl.className = "status";

  btnOpenFolder.style.display = "none";
  lastOutputPath = null;

  outputFilenameInput.value = `${stem}_subtitled`;
  loadVideoThumbnail(path);
}

function tryNativeThumbnail(filePath) {
  return new Promise((resolve) => {
    const { convertFileSrc } = window.__TAURI__.core;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = convertFileSrc(filePath);
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(3, video.duration * 0.1);
    });
    video.addEventListener("seeked", () => {
      const oc = document.createElement("canvas");
      oc.width = video.videoWidth;
      oc.height = video.videoHeight;
      oc.getContext("2d").drawImage(video, 0, 0);
      video.src = "";
      resolve(oc);
    });
    video.addEventListener("error", () => resolve(null));
    // Fallback if video loads but never fires seeked (unsupported codec)
    setTimeout(() => resolve(null), 4000);
  });
}

async function loadVideoThumbnail(filePath) {
  clearPreviewThumbnail();
  const native = await tryNativeThumbnail(filePath);
  if (native) {
    setPreviewThumbnail(native);
    return;
  }
  // Native WebView2 can't decode this codec (e.g. HEVC); use FFmpeg fallback
  try {
    const dataUrl = await invoke("extract_thumbnail", { videoPath: filePath });
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        const oc = document.createElement("canvas");
        oc.width = img.naturalWidth;
        oc.height = img.naturalHeight;
        oc.getContext("2d").drawImage(img, 0, 0);
        setPreviewThumbnail(oc);
      };
      img.src = dataUrl;
    }
  } catch (_) {
    // thumbnail unavailable, preview uses plain background
  }
}

function setupOutputFolder() {
  btnSelectOutputFolder.addEventListener("click", async () => {
    const dir = await open({ directory: true, multiple: false });
    if (!dir) return;
    selectedOutputDir = dir;
    outputFolderPath.textContent =
      dir.replace(/\\/g, "/").split("/").pop() || dir;
    saveSettings();
  });
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
  btnGenerate.addEventListener("click", generate);
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

  isProcessing = true;
  btnGenerate.disabled = true;
  btnOpenFolder.style.display = "none";
  statusEl.textContent = "";
  statusEl.className = "status";
  progressFill.style.width = "0%";
  progressLabel.textContent = STRINGS[currentLang].stepStarting;

  saveSettings();

  try {
    const customName = outputFilenameInput.value.trim();
    const outputPath = await invoke("generate_subtitles", {
      videoPath: selectedVideoPath,
      settings: getSettings(),
      outputDir: selectedOutputDir ?? null,
      outputFilename: customName || null,
    });

    lastOutputPath = outputPath;
    statusEl.textContent = STRINGS[currentLang].statusSuccess;
    statusEl.className = "status success";
    btnOpenFolder.style.display = "block";
  } catch (err) {
    progressLabel.textContent = "";
    statusEl.textContent = `${STRINGS[currentLang].errorPrefix}${err}`;
    statusEl.className = "status error";
    progressFill.style.width = "0%";
  } finally {
    isProcessing = false;
    btnGenerate.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", init);
