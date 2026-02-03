import { API_URL } from "./config.js";

export async function apiGet(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  return await res.json();
}

export async function apiPostForm(bodyObj, timeoutMs = 15000) {
  const form = new URLSearchParams();
  Object.entries(bodyObj).forEach(([k, v]) => form.set(k, String(v)));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: form,
      signal: controller.signal
    });

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: "Respuesta no JSON del servidor.", raw: text.slice(0, 200) };
    }
  } finally {
    clearTimeout(t);
  }
}
