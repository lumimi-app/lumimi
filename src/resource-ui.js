import { DEFAULTS, MODEL_LABELS, STRINGS } from "./config.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const HIGH_ACCURACY_MODEL_PATH = "models/ggml-large-v3-turbo.bin";

export async function ensureDefaultModel() {
  const models = await invoke("list_models");
  const defaultModel = models[0];
  if (defaultModel && !defaultModel.available) {
    await downloadModel(defaultModel);
  }
}

async function downloadModel(model) {
  const overlay = document.getElementById("download-overlay");
  const fill = document.getElementById("download-fill");
  const pct = document.getElementById("download-pct");
  const desc = document.getElementById("download-desc");

  overlay.style.display = "flex";

  const unlisten = await listen("download_progress", (event) => {
    const { progress, downloaded, total } = event.payload;
    fill.style.width = `${progress * 100}%`;
    const dlMB = (downloaded / 1024 / 1024).toFixed(0);
    const totalMB = total ? `${(total / 1024 / 1024).toFixed(0)} MB` : "---";
    desc.textContent = `${dlMB} MB / ${totalMB}`;
    pct.textContent = `${(progress * 100).toFixed(1)}%`;
  });

  try {
    const filename = model.path.split("/").pop();
    await invoke("download_model", { url: model.url, filename });
  } finally {
    unlisten();
    overlay.style.display = "none";
  }
}

function showHighModelConfirm(lang) {
  const s = STRINGS[lang];
  const overlay = document.getElementById("model-confirm-overlay");
  const title = document.getElementById("model-confirm-title");
  const message = document.getElementById("model-confirm-message");
  const confirm = document.getElementById("btn-model-confirm");
  const cancel = document.getElementById("btn-model-cancel");

  title.textContent = s.highModelConfirmTitle;
  message.textContent = s.highModelConfirmMessage;
  confirm.textContent = s.highModelConfirmYes;
  cancel.textContent = s.highModelConfirmNo;
  overlay.style.display = "flex";

  return new Promise((resolve) => {
    const close = (value) => {
      overlay.style.display = "none";
      confirm.removeEventListener("click", onConfirm);
      cancel.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      resolve(value);
    };
    const onConfirm = () => close(true);
    const onCancel = () => close(false);
    const onOverlayClick = (event) => {
      if (event.target === overlay) close(false);
    };

    confirm.addEventListener("click", onConfirm);
    cancel.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
  });
}

export async function loadModelList({ modelSelect, getCurrentLang, saveSettings }) {
  const lang = getCurrentLang();
  const s = STRINGS[lang];
  const highModelButton = document.getElementById("btn-download-high-model");
  const saved =
    JSON.parse(localStorage.getItem("settings") || "{}").model_path ??
    "models/ggml-medium.bin";
  try {
    const models = await invoke("list_models");
    const modelsByPath = new Map(models.map((m) => [m.path, m]));
    const highModel = modelsByPath.get(HIGH_ACCURACY_MODEL_PATH);

    modelSelect.innerHTML = "";
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.path;
      const label = MODEL_LABELS[m.path]?.[lang] || m.label;
      opt.textContent =
        m.path === HIGH_ACCURACY_MODEL_PATH && !m.available
          ? s.highModelUnavailableOption
          : m.available ? label : `${label}${s.modelNotInstalled}`;
      if (!m.available) opt.style.color = "var(--text-dim)";
      modelSelect.appendChild(opt);
    }
    modelSelect.value = saved;
    if (!modelSelect.value) {
      const first = models.find((m) => m.available);
      if (first) modelSelect.value = first.path;
    }

    let lastAvailableValue = modelSelect.value;
    if (!modelsByPath.get(lastAvailableValue)?.available) {
      const first = models.find((m) => m.available);
      lastAvailableValue = first?.path || "models/ggml-medium.bin";
      modelSelect.value = lastAvailableValue;
    }

    const refreshAfterDownload = async () => {
      if (!highModel) return;
      const accepted = await showHighModelConfirm(getCurrentLang());
      if (!accepted) return;
      await downloadModel(highModel);
      await loadModelList({ modelSelect, getCurrentLang, saveSettings });
      modelSelect.value = highModel.path;
      saveSettings();
    };

    if (highModelButton) {
      highModelButton.textContent = s.highModelDownloadButton;
      highModelButton.style.display = highModel && !highModel.available ? "" : "none";
      highModelButton.onclick = refreshAfterDownload;
    }

    modelSelect.onchange = async () => {
      const selected = modelsByPath.get(modelSelect.value);
      if (selected && !selected.available) {
        modelSelect.value = lastAvailableValue;
        await refreshAfterDownload();
        return;
      }
      lastAvailableValue = modelSelect.value;
      saveSettings();
    };
  } catch {
    modelSelect.innerHTML = `<option value="${saved}">medium</option>`;
    if (highModelButton) highModelButton.style.display = "none";
  }
}

export async function loadFontList({ fontSelect }) {
  const saved =
    JSON.parse(localStorage.getItem("settings") || "{}").font_name || DEFAULTS.fontName;
  try {
    const fonts = await invoke("list_fonts");
    fontSelect.innerHTML = "";
    const names = fonts.includes(saved) ? fonts : [saved, ...fonts];
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      fontSelect.appendChild(opt);
    }
    fontSelect.value = saved;
  } catch {
    fontSelect.value = saved;
  }
}
