import { $, getStockState } from "./dom.js";

export function setStatsLoading() {
  ["statTotalVal","statUnitsVal","statOutVal","statLowVal","statOkVal"].forEach(id => {
    const el = $(id); if (!el) return;
    el.textContent = "—";
    el.closest(".stat-card")?.classList.add("stat-loading");
  });
}

/* ===== Contador animado ===== */
function animateCounter(el, from, to, duration = 600) {  if (from === to) { el.textContent = to; return; }
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    // easeOutCubic
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

export function updateStats(list) {
  const total = list.length;
  const out   = list.filter(i => getStockState(i) === "out").length;
  const low   = list.filter(i => getStockState(i) === "low").length;
  const ok    = total - out - low;
  const units = list.reduce((acc, i) => acc + Number(i.stock || 0), 0);

  const setVal = (id, newVal) => {
    const el = $(id); if (!el) return;
    const oldVal = parseInt(el.textContent) || 0;
    el.closest(".stat-card")?.classList.remove("stat-loading");
    animateCounter(el, oldVal, newVal);
  };

  setVal("statTotalVal", total);
  setVal("statUnitsVal", units);
  setVal("statOutVal",   out);
  setVal("statLowVal",   low);
  setVal("statOkVal",    ok);

  // Pulso en cards de peligro según intensidad
  const outCard = $("statOutVal")?.closest(".stat-card");
  const lowCard = $("statLowVal")?.closest(".stat-card");
  if (outCard) {
    outCard.classList.toggle("stat-pulse-high",   out >= 5);
    outCard.classList.toggle("stat-pulse-medium", out > 0 && out < 5);
    if (out === 0) { outCard.classList.remove("stat-pulse-high","stat-pulse-medium"); }
  }
  if (lowCard) {
    lowCard.classList.toggle("stat-pulse-medium", low > 0);
    if (low === 0) lowCard.classList.remove("stat-pulse-medium");
  }

  // Titulo pestana
  document.title = out > 0 ? `(${out}) RECTIFREN | Inventario` : "RECTIFREN | Inventario";

  // Donut
  drawDonut({ ok, low, out });
}

/* Lee una variable de color del tema (soporta cambio claro/oscuro). */
function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
function trackColor() { return cssVar("--border2", "rgba(120,130,145,0.3)"); }

function drawDonut({ ok, low, out }) {
  const canvas = document.getElementById("donutChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const total = ok + low + out;
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2, r = W/2 - 4, inner = r * 0.58;
  ctx.clearRect(0, 0, W, H);
  if (total === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = trackColor();
    ctx.lineWidth = r - inner; ctx.stroke(); return;
  }
  const segments = [
    { val: ok,  color: cssVar("--success", "#16a34a") },
    { val: low, color: cssVar("--warn",    "#d97706") },
    { val: out, color: cssVar("--danger",  "#dc2626") },
  ].filter(s => s.val > 0);
  let angle = -Math.PI / 2;
  for (const seg of segments) {
    const sweep = (seg.val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, (r + inner) / 2, angle, angle + sweep);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = r - inner;
    ctx.lineCap = "butt";
    ctx.stroke();
    angle += sweep;
  }
}
export function setActiveChip(id) {
  ["fAll","fOut","fLow"].forEach(x => $(x)?.classList.remove("active"));
  $(id)?.classList.add("active");
}

/* ===== Chip counts ===== */
export function updateChipCounts(list) {
  const out = list.filter(i => getStockState(i) === "out").length;
  const low = list.filter(i => getStockState(i) === "low").length;
  const fOut = $("fOut"); if (fOut) fOut.textContent = `Faltantes${out ? ` (${out})` : ""}`;
  const fLow = $("fLow"); if (fLow) fLow.textContent = `Bajo stock${low ? ` (${low})` : ""}`;
}
