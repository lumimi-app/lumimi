import { FONT_LICENSES, STRINGS } from "./config.js";

export function setupLicenseModal({ getCurrentLang }) {
  const overlay = document.getElementById("license-overlay");
  const list = document.getElementById("license-list");
  const s = STRINGS[getCurrentLang()];

  const sortedFonts = [...FONT_LICENSES].sort((a, b) =>
    a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" })
  );

  list.innerHTML = sortedFonts.map((f) => `
    <div class="license-entry">
      <span class="license-font-name">${f.name}</span>
      <span class="license-author">${f.author}</span>
      ${f.url
        ? `<button class="license-badge license-badge--link" data-url="${f.url}">${f.license}</button>`
        : `<span class="license-badge">${f.license}</span>`
      }
    </div>
  `).join("") + `
    <div class="license-footer">
      <span class="license-note">${s.licenseNote}</span>
      <button class="license-link" id="btn-ofl-link">${s.licenseLink}</button>
    </div>
  `;

  list.querySelectorAll(".license-badge--link").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.__TAURI__.opener.openUrl(btn.dataset.url);
    });
  });
  document.getElementById("btn-ofl-link").addEventListener("click", () => {
    window.__TAURI__.opener.openUrl("https://openfontlicense.org");
  });
  document.getElementById("btn-licenses").addEventListener("click", () => {
    overlay.style.display = "flex";
  });
  document.getElementById("btn-license-close").addEventListener("click", () => {
    overlay.style.display = "none";
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.style.display = "none";
  });
}
