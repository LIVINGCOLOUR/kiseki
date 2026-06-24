(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let selectedVideoFile = null;
  let selectedPhotoFiles = [];
  let lastSavedRecord = null;
  let analyticsRows = [];

  document.addEventListener("DOMContentLoaded", async () => {
    window.YNHAuth?.setupLogout();
    if (document.body.hasAttribute("data-require-auth")) {
      const state = await window.YNHAuth.requireAuth();
      if (!state) return;
    }

    const page = currentPage();
    if (page === "login") setupLogin();
    if (page === "dashboard") setupDashboard();
    if (page === "profile") setupProfile();
    if (page === "harvest-admin") setupHarvestAdmin();
    if (page === "harvest") setupPublicHarvest();
    if (page === "farmer") setupPublicFarmer();
    if (page === "analytics") setupAnalytics();
  });

  function currentPage() {
    const last = location.pathname.split("/").pop() || "index.html";
    return last.replace(/\.html$/, "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function formatDateJa(date) {
    const parts = String(date || "").split("-");
    if (parts.length !== 3) return date || "";
    return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
  }

  function setupLogin() {
    const form = $("[data-login-form]");
    if (!form) return;
    const status = $("[data-login-status]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "ログインしています...";
      status.className = "status";
      const formData = new FormData(form);
      try {
        await window.YNHAuth.apiJson("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            farmId: formData.get("farmId"),
            adminKey: formData.get("adminKey"),
          }),
        });
        const next = new URLSearchParams(location.search).get("next") || "dashboard.html";
        window.location.href = next;
      } catch (error) {
        status.textContent = error.message || "ログインに失敗しました。";
        status.classList.add("is-error");
      }
    });
  }

  async function setupDashboard() {
    const auth = window.YNHAuth.state;
    const container = $("[data-dashboard-records]");
    if (!container) return;
    try {
      const data = await window.YNHAuth.apiJson(`/api/farmer/${encodeURIComponent(auth.farmId)}/harvests`, { method: "GET" });
      renderRecords(container, data.records || []);
    } catch (error) {
      container.innerHTML = `<p class="status is-error">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderRecords(container, records) {
    if (!records.length) {
      container.innerHTML = '<p class="note">登録済みコンテンツはまだありません。</p>';
      return;
    }
    container.innerHTML = records.map((record) => `
      <article class="record-row">
        <div>
          <strong>${escapeHtml(record.title || "今日の畑の様子")}</strong>
          <p class="note">${escapeHtml(formatDateJa(record.date))} / ${escapeHtml(record.productName || "品目未設定")}</p>
        </div>
        <div class="actions">
          <a class="button" href="harvest.html?id=${encodeURIComponent(record.id)}" target="_blank" rel="noopener">公開ページ</a>
        </div>
      </article>
    `).join("");
  }

  async function setupProfile() {
    const form = $("[data-profile-form]");
    if (!form) return;
    const auth = window.YNHAuth.state;
    const status = $("[data-profile-status]");
    const publicLink = $("[data-profile-public-link]");
    const fields = {
      name: $('[name="name"]', form),
      area: $('[name="area"]', form),
      description: $('[name="description"]', form),
      imageUrl: $('[name="imageUrl"]', form),
      links: $('[name="links"]', form),
      isPublic: $('[name="isPublic"]', form),
    };
    if (publicLink) publicLink.href = `farmer.html?id=${encodeURIComponent(auth.farmId)}`;

    try {
      const data = await window.YNHAuth.apiJson(`/api/farmer/${encodeURIComponent(auth.farmId)}`, { method: "GET" });
      const farmer = data.farmer || {};
      fields.name.value = farmer.name || "";
      fields.area.value = farmer.area || "";
      fields.description.value = farmer.description || "";
      fields.imageUrl.value = farmer.imageUrl || "";
      fields.links.value = Array.isArray(farmer.links) ? farmer.links.map((item) => item.url || item).join("\n") : "";
      fields.isPublic.checked = farmer.isPublic !== false;
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("is-error");
    }

    $("[data-profile-image]")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      status.textContent = "画像をアップロードしています...";
      const body = new FormData();
      body.append("image", file);
      try {
        const response = await fetch("/api/profile/upload", { method: "POST", credentials: "include", body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "画像アップロードに失敗しました。");
        fields.imageUrl.value = data.url;
        status.textContent = "画像をアップロードしました。保存すると公開ページに反映されます。";
        status.className = "status is-success";
      } catch (error) {
        status.textContent = error.message;
        status.className = "status is-error";
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "保存しています...";
      status.className = "status";
      const links = fields.links.value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean).map((url) => ({ label: url, url }));
      try {
        await window.YNHAuth.apiJson("/api/farmer/save", {
          method: "POST",
          body: JSON.stringify({
            name: fields.name.value,
            area: fields.area.value,
            description: fields.description.value,
            imageUrl: fields.imageUrl.value,
            links,
            isPublic: fields.isPublic.checked,
          }),
        });
        status.textContent = "保存しました。";
        status.className = "status is-success";
      } catch (error) {
        status.textContent = error.message;
        status.className = "status is-error";
      }
    });
  }

  function setupHarvestAdmin() {
    const form = $("[data-harvest-form]");
    if (!form) return;
    const status = $("[data-harvest-status]");
    const fields = {
      date: $('[name="date"]', form),
      productName: $('[name="productName"]', form),
      title: $('[name="title"]', form),
      note: $('[name="note"]', form),
    };
    const videoInput = $("[data-harvest-video]");
    const photoInput = $("[data-harvest-photos]");
    const videoPreview = $("[data-video-preview]");
    const photoPreview = $("[data-photo-preview]");
    if (fields.date && !fields.date.value) fields.date.value = new Date().toISOString().slice(0, 10);

    document.addEventListener("harvest-composed-video-ready", (event) => {
      const file = event.detail?.file;
      if (!(file instanceof File)) return;
      selectedVideoFile = file;
      renderVideoPreview(videoPreview, file);
      setStatus(status, "完成動画を収穫動画に設定しました。", false);
    });

    videoInput?.addEventListener("change", () => {
      selectedVideoFile = videoInput.files?.[0] || null;
      renderVideoPreview(videoPreview, selectedVideoFile);
    });

    photoInput?.addEventListener("change", () => {
      selectedPhotoFiles = Array.from(photoInput.files || []);
      renderPhotoPreview(photoPreview, selectedPhotoFiles);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const auth = window.YNHAuth.state;
      const date = fields.date.value;
      const productName = fields.productName.value.trim();
      const recordId = createClientRecordId(auth.farmId, productName, date);
      if (!date) return setStatus(status, "日付を入力してください。", true);
      if (!selectedVideoFile) return setStatus(status, "完成動画を設定してください。", true);

      try {
        setStatus(status, "動画と写真を保存しています...", false);
        const uploadForm = new FormData();
        uploadForm.append("recordId", recordId);
        uploadForm.append("video", selectedVideoFile);
        selectedPhotoFiles.forEach((file) => uploadForm.append("photo", file));
        const uploadResponse = await fetch("/api/harvest/upload", { method: "POST", credentials: "include", body: uploadForm });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadData.error || "アップロードに失敗しました。");

        setStatus(status, "収穫記録を保存しています...", false);
        const saveData = await window.YNHAuth.apiJson("/api/harvest/save", {
          method: "POST",
          body: JSON.stringify({
            date,
            productName,
            title: fields.title.value.trim(),
            note: fields.note.value.trim(),
            videoUrl: uploadData.videoUrl,
            videoThumbnailUrl: uploadData.videoThumbnailUrl,
            photoUrls: uploadData.photoUrls,
          }),
        });
        lastSavedRecord = saveData.record;
        renderQr(saveData.record);
        setStatus(status, "保存しました。QRを発行しました。", false, true);
      } catch (error) {
        setStatus(status, error.message, true);
      }
    });

    $("[data-copy-url]")?.addEventListener("click", async () => {
      if (!lastSavedRecord) return;
      await navigator.clipboard?.writeText(getPublicHarvestUrl(lastSavedRecord.id));
    });
    $("[data-download-qr]")?.addEventListener("click", () => {
      const canvas = $("[data-qr-canvas]");
      if (!canvas || !lastSavedRecord) return;
      const link = document.createElement("a");
      link.download = `${lastSavedRecord.id}-qr.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  }

  function renderVideoPreview(container, file) {
    if (!container) return;
    if (!file) {
      container.innerHTML = '<p class="note">完成動画を設定するとここにプレビューが表示されます。</p>';
      return;
    }
    const url = URL.createObjectURL(file);
    container.innerHTML = `<div class="video-box"><video src="${url}" controls playsinline></video></div><p class="note">${escapeHtml(file.name)} / ${formatBytes(file.size)}</p>`;
  }

  function renderPhotoPreview(container, files) {
    if (!container) return;
    if (!files.length) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = files.map((file) => `<img src="${URL.createObjectURL(file)}" alt="">`).join("");
  }

  function renderQr(record) {
    const box = $("[data-qr-box]");
    const canvas = $("[data-qr-canvas]");
    const urlEl = $("[data-qr-url]");
    const openLink = $("[data-open-public]");
    const url = getPublicHarvestUrl(record.id);
    if (window.QRCodeLite && canvas) {
      window.QRCodeLite.toCanvas(canvas, url, { scale: 6, margin: 4 });
    }
    if (urlEl) urlEl.textContent = url;
    if (openLink) openLink.href = url;
    if (box) box.hidden = false;
  }

  async function setupPublicHarvest() {
    const container = $("[data-harvest-public]");
    const id = new URLSearchParams(location.search).get("id") || "";
    if (!container) return;
    try {
      const data = await fetchJson(`/api/harvest/${encodeURIComponent(id)}`);
      const record = data.record;
      const farmer = data.farmer;
      document.title = `${record.productName || "今日の畑の様子"} | やさいの背景`;
      container.innerHTML = `
        <p class="eyebrow">今日の畑の様子</p>
        <h1>${escapeHtml(record.productName || "野菜")}</h1>
        <p class="lead">${escapeHtml(formatDateJa(record.date))} / ${escapeHtml(farmer?.name || record.farmerId)}</p>
        ${record.videoUrl ? `<div class="video-box"><video src="${escapeHtml(record.videoUrl)}" poster="${escapeHtml(record.videoThumbnailUrl || "")}" controls playsinline preload="metadata" data-public-video></video></div>` : '<p class="note">この日の動画はまだありません。</p>'}
        ${record.note ? `<p>${escapeHtml(record.note)}</p>` : ""}
        <div class="photo-grid">${(record.photoUrls || []).map((url) => `<img src="${escapeHtml(url)}" alt="">`).join("") || '<p class="note">この日の写真はまだありません。</p>'}</div>
        <div class="actions"><a class="button" href="farmer.html?id=${encodeURIComponent(record.farmerId)}" data-profile-click>農園プロフィールを見る</a></div>
      `;
      window.YNHAnalytics?.track("page_view", { recordId: record.id, farmerId: record.farmerId });
      $("[data-public-video]")?.addEventListener("play", () => window.YNHAnalytics?.track("video_play", { recordId: record.id, farmerId: record.farmerId }), { once: true });
      $("[data-public-video]")?.addEventListener("ended", () => window.YNHAnalytics?.track("video_ended", { recordId: record.id, farmerId: record.farmerId }));
      $("[data-profile-click]")?.addEventListener("click", () => window.YNHAnalytics?.track("profile_click", { recordId: record.id, farmerId: record.farmerId }));
    } catch (error) {
      container.innerHTML = `<p class="eyebrow">今日の畑の様子</p><h1>記録が見つかりません</h1><p class="lead">${escapeHtml(error.message)}</p>`;
    }
  }

  async function setupPublicFarmer() {
    const container = $("[data-farmer-public]");
    const farmId = new URLSearchParams(location.search).get("id") || "farm-01";
    if (!container) return;
    try {
      const [farmerData, harvestData] = await Promise.all([
        fetchJson(`/api/farmer/${encodeURIComponent(farmId)}`),
        fetchJson(`/api/farmer/${encodeURIComponent(farmId)}/harvests`),
      ]);
      const farmer = farmerData.farmer;
      const records = harvestData.records || [];
      document.title = `${farmer.name} | やさいの背景`;
      container.innerHTML = `
        ${farmer.imageUrl ? `<img src="${escapeHtml(farmer.imageUrl)}" alt="" style="width:100%;max-height:320px;object-fit:cover;border-radius:20px;">` : ""}
        <p class="eyebrow">農園プロフィール</p>
        <h1>${escapeHtml(farmer.name)}</h1>
        <p class="lead">${escapeHtml(farmer.area || "地域未設定")}</p>
        <p>${escapeHtml(farmer.description || "紹介文は準備中です。")}</p>
        <h2>最近の畑の様子</h2>
        <div class="records-list">
          ${records.map((record) => `<a class="record-row" href="harvest.html?id=${encodeURIComponent(record.id)}"><span><strong>${escapeHtml(record.title || "今日の畑の様子")}</strong><br><span class="note">${escapeHtml(formatDateJa(record.date))}</span></span><span>見る →</span></a>`).join("") || '<p class="note">最近の記録はまだありません。</p>'}
        </div>
      `;
    } catch (error) {
      container.innerHTML = `<h1>農園が見つかりません</h1><p class="lead">${escapeHtml(error.message)}</p>`;
    }
  }

  async function setupAnalytics() {
    const container = $("[data-analytics-table]");
    if (!container) return;
    try {
      const data = await window.YNHAuth.apiJson("/api/analytics/summary", { method: "GET" });
      analyticsRows = data.rows || [];
      renderAnalyticsTable(container, analyticsRows);
    } catch (error) {
      container.innerHTML = `<p class="status is-error">${escapeHtml(error.message)}</p>`;
    }
    $("[data-download-csv]")?.addEventListener("click", downloadAnalyticsCsv);
  }

  function renderAnalyticsTable(container, rows) {
    if (!rows.length) {
      container.innerHTML = '<p class="note">解析対象のコンテンツはまだありません。</p>';
      return;
    }
    container.innerHTML = `
      <table>
        <thead><tr><th>recordId</th><th>品目</th><th>日付</th><th>PV</th><th>再生</th><th>完了</th><th>農園遷移</th><th>再生率</th><th>完了率</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.productName)}</td><td>${escapeHtml(row.date)}</td><td>${row.pageViews}</td><td>${row.videoPlays}</td><td>${row.videoEnded}</td><td>${row.profileClicks}</td><td>${percent(row.playRate)}</td><td>${percent(row.completionRate)}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function downloadAnalyticsCsv() {
    const header = ["recordId", "productName", "date", "pageViews", "videoPlays", "videoEnded", "profileClicks", "playRate", "completionRate", "profileClickRate"];
    const rows = analyticsRows.map((row) => header.map((key) => JSON.stringify(row[key] ?? "")).join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "yasai-no-haikei-analytics.csv";
    link.click();
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "読み込みに失敗しました。");
    return data;
  }

  function createClientRecordId(farmId, productName, date) {
    const productSlug = String(productName || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return productSlug ? `${farmId}-${productSlug}-${date}` : `${farmId}-${date}`;
  }

  function getPublicHarvestUrl(recordId) {
    return `${location.origin}${location.pathname.replace(/[^/]+$/, "")}harvest.html?id=${encodeURIComponent(recordId)}`;
  }

  function setStatus(el, message, isError, isSuccess) {
    if (!el) return;
    el.textContent = message;
    el.className = `status${isError ? " is-error" : ""}${isSuccess ? " is-success" : ""}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function percent(value) {
    return `${Math.round((Number(value) || 0) * 100)}%`;
  }
})();
