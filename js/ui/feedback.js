import { $, escapeHtml } from "./dom.js";
import { setStatsLoading } from "./stats.js";
import { icon } from "./icons.js";

export function setBusy(on, text = "Aplicando cambio…") {
  const overlay = $("busyOverlay");
  const msg     = $("busyText");
  if (msg) msg.textContent = text;
  if (overlay) {
    overlay.style.display = on ? "flex" : "none";
    overlay.setAttribute("aria-hidden", on ? "false" : "true");
  }
  ["btnAdmin","btnTheme","fAll","fOut","fLow"].forEach(id => {
    const b = $(id); if (b) b.disabled = on;
  });
  document.querySelectorAll("button[data-act]").forEach(btn => {
    btn.disabled = on || btn.dataset.disabled === "1";
  });
}

/* ===== Toasts ===== */
export function showToast(message, type = "info", duration = 3200) {
  const container = $("toastContainer");
  if (!container) return;
  const icons = { success: icon("check-circle"), error: icon("x-circle"), info: icon("info") };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type]||icon("info")}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-exit");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}
export function showSkeleton(rows = 8) {
  const tbody = $("tbody");
  tbody.innerHTML = "";
  setStatsLoading();
  const cols = document.querySelectorAll("table#stockTable thead tr th").length;
  const widths = [["55%"],["80%","65%","70%"],["35%"],["60%"],["60%"]];

  for (let i = 0; i < rows; i++) {
    const tr = document.createElement("tr");
    tr.className = "skeleton-row";
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      const w = widths[c] ? widths[c][i % widths[c].length] : "50%";
      td.innerHTML = `<span class="skeleton-cell" style="width:${w}; max-width:100%"></span>`;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}
