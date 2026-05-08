import { STRINGS } from "./config.js";

const { invoke } = window.__TAURI__.core;

let dictEntries = [];
let getCurrentLang = () => "ja";

export async function loadDict() {
  try {
    dictEntries = await invoke("load_dict");
  } catch (_) {
    dictEntries = [{ from: "るみみ", to: "Lumimi" }];
  }
  renderDictList();
}

async function saveDict() {
  try {
    await invoke("save_dict", { entries: dictEntries });
  } catch (_) {}
}

export function renderDictList() {
  const list = document.getElementById("dict-list");
  if (!list) return;
  list.innerHTML = "";
  const s = STRINGS[getCurrentLang()];
  if (dictEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dict-empty";
    empty.textContent = s.dictEmpty;
    list.appendChild(empty);
    return;
  }
  dictEntries.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "dict-item";
    const fromSpan = document.createElement("span");
    fromSpan.className = "dict-item-from";
    fromSpan.textContent = entry.from;
    const arrow = document.createElement("span");
    arrow.className = "dict-item-arrow";
    arrow.textContent = "→";
    const toSpan = document.createElement("span");
    toSpan.className = "dict-item-to";
    toSpan.textContent = entry.to;
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-dict-delete";
    delBtn.textContent = s.dictDelete;
    delBtn.addEventListener("click", () => {
      dictEntries.splice(i, 1);
      saveDict();
      renderDictList();
    });
    row.appendChild(fromSpan);
    row.appendChild(arrow);
    row.appendChild(toSpan);
    row.appendChild(delBtn);
    list.appendChild(row);
  });
}

export function setupDict(options) {
  getCurrentLang = options.getCurrentLang;
  const btnAdd = document.getElementById("btn-dict-add");
  const fromInput = document.getElementById("dict-from");
  const toInput = document.getElementById("dict-to");
  if (!btnAdd || !fromInput || !toInput) return;

  const doAdd = () => {
    const from = fromInput.value.trim();
    const to = toInput.value.trim();
    if (!from) return;
    dictEntries.push({ from, to });
    saveDict();
    renderDictList();
    fromInput.value = "";
    toInput.value = "";
    fromInput.focus();
  };

  btnAdd.addEventListener("click", doAdd);
  toInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
  fromInput.addEventListener("keydown", (e) => { if (e.key === "Enter") toInput.focus(); });
}
