import { STRINGS } from "./config.js";

export function setupVideoUi({
  open,
  invoke,
  addTauriListener,
  getIsProcessing,
  getCurrentLang,
  setSelectedVideoPath,
  setLastOutputPath,
  setSelectedOutputDir,
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
}) {
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

  function setVideoPath(path) {
    setSelectedVideoPath(path);

    const name = path.replace(/\\/g, "/").split("/").pop();
    const stem = name.replace(/\.[^.]+$/, "");

    fileNameEl.textContent = name;
    fileNameEl.style.display = "block";

    dropZone.classList.add("has-file");
    dropZone.querySelector(".label").textContent = STRINGS[getCurrentLang()].dropChange;

    updateGenerateButton();

    statusEl.textContent = "";
    statusEl.className = "status";

    btnOpenFolder.style.display = "none";
    setLastOutputPath(null);

    outputFilenameInput.value = `${stem}_subtitled`;
    loadVideoThumbnail(path);
  }

  dropZone.addEventListener("click", async () => {
    if (getIsProcessing()) return;
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
    if (getIsProcessing()) return;
    const paths = event.payload?.paths;
    if (paths && paths.length > 0) setVideoPath(paths[0]);
  });

  btnSelectOutputFolder.addEventListener("click", async () => {
    const dir = await open({ directory: true, multiple: false });
    if (!dir) return;
    setSelectedOutputDir(dir);
    outputFolderPath.textContent =
      dir.replace(/\\/g, "/").split("/").pop() || dir;
    saveSettings();
  });
}
