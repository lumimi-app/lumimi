export function setupPanelResizer() {
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
