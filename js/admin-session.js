const ADMIN_SESSION_KEY = "rectifren_admin_session";

export function createAdminSession(onExpired) {
  let adminSession = null;
  let sessionExpiryTimer = null;

  function scheduleSessionExpiry() {
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    const remaining = (adminSession?.expiresAt || 0) - Date.now();
    if (remaining <= 0) return;
    sessionExpiryTimer = setTimeout(onExpired, remaining);
  }

  function restoreAdminSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || "null");
      if (saved?.token && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) {
        adminSession = saved;
        scheduleSessionExpiry();
        return true;
      }
    } catch { /* sesión inválida */ }
    localStorage.removeItem(ADMIN_SESSION_KEY);
    adminSession = null;
    return false;
  }

  function getAdminToken() {
    return adminSession?.expiresAt > Date.now() ? adminSession.token : "";
  }

  function saveAdminSession(token, expiresAt) {
    adminSession = { token, expiresAt };
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSession));
    scheduleSessionExpiry();
  }

  function clearAdminSession() {
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = null;
    adminSession = null;
    localStorage.removeItem(ADMIN_SESSION_KEY);
  }

  return { restoreAdminSession, getAdminToken, saveAdminSession, clearAdminSession };
}
