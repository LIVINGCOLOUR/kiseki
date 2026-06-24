(function () {
  "use strict";

  const SESSION_KEY = "ynh_consumer_session";

  function getSessionId() {
    let id = "";
    try {
      id = window.sessionStorage.getItem(SESSION_KEY) || "";
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        window.sessionStorage.setItem(SESSION_KEY, id);
      }
    } catch (error) {
      id = `${Date.now()}-${Math.random()}`;
    }
    return id;
  }

  function track(eventName, payload) {
    const body = JSON.stringify({
      eventName,
      sessionId: getSessionId(),
      pagePath: location.pathname + location.search,
      referrer: document.referrer,
      ...payload,
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/track", blob)) return;
    }
    fetch("/api/analytics/track", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body,
    }).catch(() => {});
  }

  window.YNHAnalytics = { track };
})();

