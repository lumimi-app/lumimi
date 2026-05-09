// ── Subtitle Preview ──────────────────────────────────────────────────────
import { SAMPLE_WORDS } from "./config.js";

let deps = null;
let _pvIdx = 0;
let _pvFill = 0;
let _pvTick = 0;
let _pvFrameId = null;
let _pvAspect = "landscape";
let _pvThumbnail = null;
const _pvMeasureCache = new Map();

export function clearPreviewThumbnail() {
  _pvThumbnail = null;
}

export function setPreviewThumbnail(thumbnail) {
  _pvThumbnail = thumbnail;
}

function getSettings() {
  return deps.getSettings();
}

function assToCss(color) {
  return deps.assToCss(color);
}

function getPreviewRatio() {
  return _pvAspect === "portrait" ? 16 / 9 : 9 / 16;
}

function getPreviewMarginV(height, settings) {
  if (_pvAspect === "portrait" && !settings.vertical && !settings.stacking) {
    return Math.round(height / 3 + height / 48);
  }
  return Math.max(8, Math.round(settings.margin_v * height / 1080));
}

function isManualSubtitlePosition(settings) {
  return settings.position_mode === "manual";
}

function getManualPreviewPosition(width, height, settings) {
  const xPct = Math.min(100, Math.max(0, Number(settings.subtitle_x_pct ?? 50)));
  const yPct = Math.min(100, Math.max(0, Number(settings.subtitle_y_pct ?? 85)));
  return {
    x: Math.round(width * xPct / 100),
    y: Math.round(height * yPct / 100),
  };
}

export function setPreviewAspect(aspect) {
  _pvAspect = aspect === "portrait" ? "portrait" : "landscape";
  const previewCard = document.querySelector(".preview-card");
  previewCard?.classList.toggle("is-portrait", _pvAspect === "portrait");
  document.querySelectorAll(".preview-aspect-btn").forEach((btn) => {
    const isActive = btn.dataset.previewAspect === _pvAspect;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

function getPreviewCanvasSize(canvas) {
  const previewCard = canvas.closest(".preview-card");
  if (!previewCard) {
    const width = canvas.offsetWidth;
    return { width, height: Math.round(width * getPreviewRatio()) };
  }

  const cardStyle = getComputedStyle(previewCard);
  const paddingX = parseFloat(cardStyle.paddingLeft) + parseFloat(cardStyle.paddingRight);
  const paddingY = parseFloat(cardStyle.paddingTop) + parseFloat(cardStyle.paddingBottom);
  const previewTop = previewCard.querySelector(".preview-top");
  const topHeight = previewTop ? previewTop.offsetHeight : 0;
  const topMargin = previewTop ? parseFloat(getComputedStyle(previewTop).marginBottom) : 0;
  const ratio = getPreviewRatio();
  const maxWidth = Math.max(1, previewCard.clientWidth - paddingX);
  const maxHeight = previewCard.classList.contains("expanded")
    ? Math.max(1, window.innerHeight - 140)
    : Math.max(1, previewCard.clientHeight - paddingY - topHeight - topMargin);

  let width = maxWidth;
  let height = Math.round(width * ratio);
  if (height > maxHeight) {
    height = Math.floor(maxHeight);
    width = Math.round(height / ratio);
  }

  return { width: Math.max(1, width), height: Math.max(1, height) };
}

export function initPreview(previewDeps) {
  deps = previewDeps;
  const canvas = document.getElementById("subtitle-preview");
  if (!canvas) return;
  _pvTick = performance.now();
  setPreviewAspect(_pvAspect);

  function drawFrame(now) {
    const dt = now - _pvTick;
    if (dt >= 800) { _pvIdx = (_pvIdx + 1) % 3; _pvTick = now; _pvFill = 0; }
    const s = getSettings();
    if (s.highlight_style === "fill") _pvFill = Math.min(1, dt / 800);
    const { width: W, height: H } = getPreviewCanvasSize(canvas);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    if (W > 0 && H > 0) _pvDraw(canvas.getContext("2d"), W, H, s);
    if (!document.hidden) _pvFrameId = requestAnimationFrame(drawFrame);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (_pvFrameId) cancelAnimationFrame(_pvFrameId);
      _pvFrameId = null;
      return;
    }
    _pvTick = performance.now();
    if (!_pvFrameId) _pvFrameId = requestAnimationFrame(drawFrame);
  });

  _pvFrameId = requestAnimationFrame(drawFrame);
}

function _pvMeasure(ctx, text) {
  const key = `${ctx.font}\n${text}`;
  const cached = _pvMeasureCache.get(key);
  if (cached !== undefined) return cached;
  const width = ctx.measureText(text).width;
  if (_pvMeasureCache.size > 200) _pvMeasureCache.clear();
  _pvMeasureCache.set(key, width);
  return width;
}

function _pvDraw(ctx, W, H, s) {
  ctx.clearRect(0, 0, W, H);
  if (_pvThumbnail) {
    ctx.drawImage(_pvThumbnail, 0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);
  }
  const words = SAMPLE_WORDS[deps.getCurrentLang()] || SAMPLE_WORDS.ja;
  const sz = Math.max(10, Math.round(s.font_size * W / 1920));
  ctx.font = `${s.font_weight !== 0 ? "bold" : "normal"} ${sz}px "${s.font_name}", sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const tc = assToCss(s.text_color);
  const hc = assToCss(s.highlight_color);
  const sty = s.highlight_style;
  const marginV = getPreviewMarginV(H, s);
  if (!s.vertical && !s.stacking && s.display_mode === "word_popup") _pvSingle(ctx, W, H, sz, tc, hc, sty, words, marginV, s);
  else if (!s.vertical && !s.stacking && s.display_mode === "word_build") _pvBuild(ctx, W, H, sz, tc, hc, sty, words, marginV, s);
  else if (!s.vertical && !s.stacking && s.display_mode === "word_build_left") _pvBuildLeft(ctx, W, H, sz, tc, hc, sty, words, marginV, s);
  else if (s.vertical) _pvVert(ctx, W, H, sz, tc, hc, sty, words, s.stacking, s);
  else if (s.stacking) _pvStack(ctx, W, H, sz, tc, hc, sty, words, s);
  else _pvHoriz(ctx, W, H, sz, tc, hc, sty, words, marginV, s);
}

function _pvBorder(ctx, text, x, y, sz) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.lineWidth = Math.max(1, sz * 0.07);
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.restore();
}

function _pvText(ctx, text, x, y, sz, isActive, sty, tc, hc, fillProgress = 0) {
  const ww = _pvMeasure(ctx, text);
  ctx.save();
  switch (sty) {
    case "color":
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = isActive ? hc : tc;
      ctx.fillText(text, x, y);
      break;
    case "color_hold":
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = isActive || fillProgress > 0 ? hc : tc;
      ctx.fillText(text, x, y);
      break;
    case "fill":
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = tc;
      ctx.fillText(text, x, y);
      if (fillProgress > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y - sz * 1.2, ww * Math.min(1, fillProgress), sz * 1.5);
        ctx.clip();
        ctx.fillStyle = hc;
        ctx.fillText(text, x, y);
        ctx.restore();
      }
      break;
    case "dim":
      ctx.globalAlpha = isActive ? 1.0 : 0.35;
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = isActive ? hc : tc;
      ctx.fillText(text, x, y);
      break;
    case "dim_hold":
      ctx.globalAlpha = isActive || fillProgress > 0 ? 1.0 : 0.35;
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = tc;
      ctx.fillText(text, x, y);
      break;
    case "scale": {
      const sc = isActive ? 1.15 : 1.0;
      ctx.translate(x + ww / 2, y);
      ctx.scale(sc, sc);
      ctx.translate(-(x + ww / 2), -y);
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = isActive ? hc : tc;
      ctx.fillText(text, x, y);
      break;
    }
    case "glow":
      if (isActive) { ctx.shadowBlur = Math.round(sz * 0.5); ctx.shadowColor = hc; }
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = isActive ? hc : tc;
      ctx.fillText(text, x, y);
      break;
    default:
      _pvBorder(ctx, text, x, y, sz);
      ctx.fillStyle = tc;
      ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function _pvHoriz(ctx, W, H, sz, tc, hc, sty, words, marginV, s) {
  const gap = Math.round(sz * 0.3);
  const widths = words.map(w => _pvMeasure(ctx, w));
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  const manualPos = isManualSubtitlePosition(s) ? getManualPreviewPosition(W, H, s) : null;
  let x = manualPos ? manualPos.x - totalW / 2 : Math.max(W * 0.05, (W - totalW) / 2);
  const y = manualPos ? manualPos.y : H - marginV;
  words.forEach((word, i) => {
    const fillProgress = sty === "fill"
      ? (i < _pvIdx ? 1 : i === _pvIdx ? _pvFill : 0)
      : (sty === "color_hold" || sty === "dim_hold") && i <= _pvIdx
        ? 1
      : 0;
    _pvText(ctx, word, x, y, sz, i === _pvIdx, sty, tc, hc, fillProgress);
    x += widths[i] + gap;
  });
}

function _pvSingle(ctx, W, H, sz, tc, hc, sty, words, marginV, s) {
  const word = words[_pvIdx % words.length];
  const ww = _pvMeasure(ctx, word);
  const fillProgress = sty === "fill"
    ? _pvFill
    : sty === "color_hold" || sty === "dim_hold"
      ? 1
    : 0;
  const manualPos = isManualSubtitlePosition(s) ? getManualPreviewPosition(W, H, s) : null;
  _pvText(ctx, word, (manualPos ? manualPos.x : W / 2) - ww / 2, manualPos ? manualPos.y : H - marginV, sz, true, sty, tc, hc, fillProgress);
}

function _pvBuild(ctx, W, H, sz, tc, hc, sty, words, marginV, s) {
  const visible = words.slice(0, _pvIdx + 1);
  const gap = Math.round(sz * 0.3);
  const widths = visible.map((word) => _pvMeasure(ctx, word));
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, visible.length - 1);
  const manualPos = isManualSubtitlePosition(s) ? getManualPreviewPosition(W, H, s) : null;
  let x = manualPos ? manualPos.x - totalW / 2 : Math.max(W * 0.05, (W - totalW) / 2);
  const y = manualPos ? manualPos.y : H - marginV;
  visible.forEach((word, i) => {
    const fillProgress = sty === "fill"
      ? (i < visible.length - 1 ? 1 : _pvFill)
      : sty === "color_hold" || sty === "dim_hold"
        ? 1
      : 0;
    _pvText(ctx, word, x, y, sz, i === visible.length - 1, sty, tc, hc, fillProgress);
    x += widths[i] + gap;
  });
}

function _pvBuildLeft(ctx, W, H, sz, tc, hc, sty, words, marginV, s) {
  const gap = Math.round(sz * 0.3);
  const allWidths = words.map((word) => _pvMeasure(ctx, word));
  const totalFullW = allWidths.reduce((a, b) => a + b, 0) + gap * Math.max(0, words.length - 1);
  // Anchor at the left edge of the centered full line (same as where the first word
  // would sit once the whole line is displayed).
  const manualPos = isManualSubtitlePosition(s) ? getManualPreviewPosition(W, H, s) : null;
  const leftX = manualPos ? manualPos.x - totalFullW / 2 : Math.max(W * 0.05, (W - totalFullW) / 2);
  const y = manualPos ? manualPos.y : H - marginV;
  const visible = words.slice(0, _pvIdx + 1);
  let x = leftX;
  visible.forEach((word, i) => {
    const fillProgress = sty === "fill"
      ? (i < visible.length - 1 ? 1 : _pvFill)
      : sty === "color_hold" || sty === "dim_hold"
        ? 1
      : 0;
    _pvText(ctx, word, x, y, sz, i === visible.length - 1, sty, tc, hc, fillProgress);
    x += allWidths[i] + gap;
  });
}

function _pvStack(ctx, W, H, sz, tc, hc, sty, words, s) {
  const lineH = Math.round(sz * 1.4);
  const manualPos = isManualSubtitlePosition(s) ? getManualPreviewPosition(W, H, s) : null;
  const startY = manualPos ? manualPos.y : Math.round(H * 0.12) + sz;
  words.slice(0, _pvIdx + 1).forEach((word, i) => {
    const ww = _pvMeasure(ctx, word);
    const fillProgress = sty === "fill"
      ? (i < _pvIdx ? 1 : i === _pvIdx ? _pvFill : 0)
      : sty === "color_hold" || sty === "dim_hold"
        ? 1
      : 0;
    _pvText(ctx, word, (manualPos ? manualPos.x : W / 2) - ww / 2, startY + i * lineH, sz, i === _pvIdx, sty, tc, hc, fillProgress);
  });
}

function _pvVert(ctx, W, H, sz, tc, hc, sty, words, stacking, s) {
  ctx.textBaseline = "top";
  const marginH = Math.round(W / 10);
  const colStep = Math.round(sz * 1.4);
  const charH = Math.round(sz * 1.2);
  const visible = stacking ? words.slice(0, _pvIdx + 1) : words;
  const maxChars = Math.max(1, ...visible.map((word) => [...word].length));
  const blockH = maxChars * charH;
  const manualPos = isManualSubtitlePosition(s) ? getManualPreviewPosition(W, H, s) : null;
  const startY = manualPos
    ? Math.max(0, Math.round(manualPos.y - blockH / 2))
    : _pvAspect === "portrait"
    ? Math.max(Math.round(H * 0.08), Math.round((H - blockH) / 2))
    : Math.round(H * 0.1);
  visible.forEach((word, i) => {
    const isActive = i === _pvIdx;
    const colX = (manualPos ? manualPos.x : W - marginH) - i * colStep;
    [...word].forEach((char, ci) => {
      const cw = _pvMeasure(ctx, char);
      const x = colX - cw / 2;
      const y = startY + ci * charH;
      ctx.save();
      if (sty === "dim") {
        ctx.globalAlpha = isActive ? 1.0 : 0.35;
        _pvBorder(ctx, char, x, y, sz);
        ctx.fillStyle = isActive ? hc : tc;
        ctx.fillText(char, x, y);
      } else if (sty === "dim_hold") {
        ctx.globalAlpha = i <= _pvIdx ? 1.0 : 0.35;
        _pvBorder(ctx, char, x, y, sz);
        ctx.fillStyle = tc;
        ctx.fillText(char, x, y);
      } else if (sty === "fill") {
        _pvBorder(ctx, char, x, y, sz);
        ctx.fillStyle = i < _pvIdx || (isActive && ci / Math.max(1, word.length) <= _pvFill) ? hc : tc;
        ctx.fillText(char, x, y);
      } else if (sty === "color_hold") {
        _pvBorder(ctx, char, x, y, sz);
        ctx.fillStyle = i <= _pvIdx ? hc : tc;
        ctx.fillText(char, x, y);
      } else if (sty === "glow" && isActive) {
        ctx.shadowBlur = Math.round(sz * 0.5);
        ctx.shadowColor = hc;
        _pvBorder(ctx, char, x, y, sz);
        ctx.fillStyle = hc;
        ctx.fillText(char, x, y);
      } else {
        _pvBorder(ctx, char, x, y, sz);
        ctx.fillStyle = isActive ? hc : tc;
        ctx.fillText(char, x, y);
      }
      ctx.restore();
    });
  });
}
