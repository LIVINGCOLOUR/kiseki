(function () {
  "use strict";

  const authState = { checked: false, authenticated: false, farmId: "", farmer: null };

  async function apiJson(url, options) {
    const response = await fetch(url, {
      credentials: "include",
      headers: { "content-type": "application/json", ...(options?.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "API request failed");
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function getMe() {
    const data = await apiJson("/api/auth/me", { method: "GET" });
    authState.checked = true;
    authState.authenticated = !!data.authenticated;
    authState.farmId = data.farmId || "";
    authState.farmer = data.farmer || null;
    return authState;
  }

  async function requireAuth() {
    const state = await getMe();
    if (!state.authenticated) {
      window.location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      return null;
    }
    document.querySelectorAll("[data-current-farm]").forEach((el) => {
      el.textContent = `${state.farmer?.name || state.farmId}（${state.farmId}）`;
    });
    document.querySelectorAll("[data-farm-name]").forEach((el) => {
      el.textContent = state.farmer?.name || state.farmId;
    });
    return state;
  }

  function setupLogout() {
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-logout]");
      if (!button) return;
      button.disabled = true;
      try { await apiJson("/api/auth/logout", { method: "POST", body: "{}" }); }
      finally { window.location.href = "login.html"; }
    });
  }

  window.YNHAuth = { apiJson, getMe, requireAuth, setupLogout, state: authState };
})();