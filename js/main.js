(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);

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
    if (page === "farmer") setupPublicProfile();
    if (page === "records") setupPublicRecords();
    if (page === "analytics") setupAnalytics();
    setupLightbox();
  });

  function currentPage() {
    const path = location.pathname.replace(/\/$/, "");
    const last = path.split("/").pop() || "index.html";
    return last.replace(/\.html$/, "") || "index";
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
          body: JSON.stringify({ farmId: formData.get("farmId"), adminKey: formData.get("adminKey") }),
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
    const recordsLink = $("[data-records-link]");
    if (recordsLink) recordsLink.href = `records.html?id=${encodeURIComponent(auth.farmId)}`;
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
      container.innerHTML = '<p class="note">登録済みの軌跡はまだありません。</p>';
      return;
    }
    container.innerHTML = records.map((record) => `
      <article class="record-row">
        <div><strong>${escapeHtml(record.title || "今日の軌跡")}</strong><p class="note">${escapeHtml(formatDateJa(record.date))}</p></div>
        <div class="actions"><a class="button" href="harvest.html?id=${encodeURIComponent(record.id)}" target="_blank" rel="noopener">公開ページ</a></div>
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
      const profile = data.farmer || {};
      fields.name.value = profile.name || "";
      fields.area.value = profile.area || "";
      fields.description.value = profile.description || "";
      fields.imageUrl.value = profile.imageUrl || "";
      fields.links.value = Array.isArray(profile.links) ? profile.links.map((item) => item.url || item).join("\n") : "";
      fields.isPublic.checked = profile.isPublic !== false;
    } catch (error) {
      status.textContent = error.message;
      status.classList.add("is-error");
    }

    $("[data-profile-image]")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      status.textContent = "代表写真をアップロードしています...";
      status.className = "status";
      const body = new FormData();
      body.append("image", file);
      try {
        const response = await fetch("/api/profile/upload", { method: "POST", credentials: "include", body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "代表写真のアップロードに失敗しました。");
        fields.imageUrl.value = data.url;
        status.textContent = "代表写真をアップロードしました。保存すると公開プロフィールに反映されます。";
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
          body: JSON.stringify({ name: fields.name.value, area: fields.area.value, description: fields.description.value, imageUrl: fields.imageUrl.value, links, isPublic: fields.isPublic.checked }),
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
    const fields = { date: $('[name="date"]', form), title: $('[name="title"]', form), note: $('[name="note"]', form) };
    const videoPreview = $("[data-video-preview]");
    const photoInput = $("[data-harvest-photos]");
    const photoPreview = $("[data-photo-preview]");
    const composerInput = $("[data-composer-input]");
    const useSelectedButton = $("[data-use-selected-video]");
    const resetComposerButton = $("[data-composer-reset]");
    if (fields.date && !fields.date.value) fields.date.value = new Date().toISOString().slice(0, 10);

    const setSelectedVideo = (file, message) => {
      selectedVideoFile = file || null;
      renderVideoPreview(videoPreview, selectedVideoFile);
      if (useSelectedButton) useSelectedButton.disabled = !selectedVideoFile;
      if (message) setStatus(status, message, false, true);
    };

    composerInput?.addEventListener("change", () => {
      const file = Array.from(composerInput.files || []).find((item) => item.type.startsWith("video/")) || null;
      if (!file) {
        setSelectedVideo(null, "");
        return;
      }
      setSelectedVideo(file, "選んだ動画を登録対象にしました。複数本を1本に整えたい場合は「動画を整える」を押してください。");
    });

    useSelectedButton?.addEventListener("click", () => {
      const file = Array.from(composerInput?.files || []).find((item) => item.type.startsWith("video/")) || null;
      if (!file) return setStatus(status, "登録する動画を選んでください。", true);
      setSelectedVideo(file, "選んだ動画を登録対象にしました。");
    });

    resetComposerButton?.addEventListener("click", () => {
      setSelectedVideo(null, "");
    });

    document.addEventListener("harvest-composed-video-ready", (event) => {
      const file = event.detail?.file;
      if (!(file instanceof File)) return;
      setSelectedVideo(file, "整えた動画を登録対象にしました。");
    });

    photoInput?.addEventListener("change", () => {
      selectedPhotoFiles = Array.from(photoInput.files || []);
      renderPhotoPreview(photoPreview, selectedPhotoFiles);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const auth = window.YNHAuth.state;
      const date = fields.date.value;
      const recordId = createClientRecordId(auth.farmId, date);
      if (!date) return setStatus(status, "投稿日を入力してください。", true);
      if (!selectedVideoFile && !selectedPhotoFiles.length) return setStatus(status, "動画または写真を設定してください。", true);

      try {
        setStatus(status, "動画と写真を保存しています...", false);
        const uploadForm = new FormData();
        uploadForm.append("recordId", recordId);
        if (selectedVideoFile) uploadForm.append("video", selectedVideoFile);
        selectedPhotoFiles.forEach((file) => uploadForm.append("photo", file));
        const uploadResponse = await fetch("/api/harvest/upload", { method: "POST", credentials: "include", body: uploadForm });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadData.error || "アップロードに失敗しました。");

        setStatus(status, "記録を保存しています...", false);
        const saveData = await window.YNHAuth.apiJson("/api/harvest/save", {
          method: "POST",
          body: JSON.stringify({ date, productName: "", title: fields.title.value.trim(), note: fields.note.value.trim(), videoUrl: uploadData.videoUrl, videoThumbnailUrl: uploadData.videoThumbnailUrl, photoUrls: uploadData.photoUrls }),
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
      setStatus(status, "公開URLをコピーしました。", false, true);
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
      container.innerHTML = '<p class="note">動画を選ぶと、ここにプレビューが表示されます。複数本を1本に整えたい場合は「動画を整える」を押してください。</p>';
      return;
    }
    const url = URL.createObjectURL(file);
    container.innerHTML = `<div class="video-box"><video src="${url}" controls playsinline></video></div><p class="note">${escapeHtml(file.name)} / ${formatBytes(file.size)}</p>`;
  }

  function renderPhotoPreview(container, files) {
    if (!container) return;
    if (!files.length) { container.innerHTML = ""; return; }
    container.innerHTML = files.map((file) => `<img src="${URL.createObjectURL(file)}" alt="選択した写真">`).join("");
  }

  function renderQr(record) {
    const box = $("[data-qr-box]");
    const canvas = $("[data-qr-canvas]");
    const urlEl = $("[data-qr-url]");
    const openLink = $("[data-open-public]");
    const url = getPublicHarvestUrl(record.id);
    if (window.QRCodeLite && canvas) window.QRCodeLite.toCanvas(canvas, url, { scale: 6, margin: 4 });
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
      const profile = data.farmer;
      const displayTitle = record.title || "今日の軌跡";
      const photos = Array.isArray(record.photoUrls) ? record.photoUrls : [];
      if (!hasRecordContent(record)) {
        document.title = "まだコンテンツは登録されていません | 軌跡";
        container.innerHTML = `
          <p class="eyebrow">QRから見る</p>
          <h1>まだコンテンツは登録されていません</h1>
          <p class="lead">このページに表示する動画や写真は、まだ登録されていません。</p>
          <div class="actions"><a class="button primary-button" href="farmer.html?id=${encodeURIComponent(record.farmerId)}">プロフィールを見る</a></div>
        `;
        return;
      }
      document.title = `${displayTitle} | 軌跡`;
      container.innerHTML = `
        <p class="eyebrow">QRから見る</p>
        <h1>${escapeHtml(displayTitle)}</h1>
        <p class="lead">${escapeHtml(formatDateJa(record.date))} / ${escapeHtml(profile?.name || record.farmerId)}</p>
        ${record.videoUrl ? `<div class="video-box"><video src="${escapeHtml(record.videoUrl)}" poster="${escapeHtml(record.videoThumbnailUrl || "")}" controls playsinline preload="metadata" data-public-video></video></div>` : '<p class="note">この日の動画はまだありません。</p>'}
        ${record.note ? `<p>${escapeHtml(record.note)}</p>` : ""}
        <section class="public-gallery" aria-label="写真ギャラリー">
          <h2>写真ギャラリー</h2>
          <p class="note gallery-note">動画と一緒に残された写真です。クリックすると拡大できます。</p>
          <div class="photo-grid">${photos.length ? photos.map((url, index) => `<button class="public-photo-link" type="button" data-lightbox-url="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="写真 ${index + 1}"></button>`).join("") : '<p class="note">この日の写真はまだありません。</p>'}</div>
        </section>
        <div class="actions"><a class="button primary-button" href="farmer.html?id=${encodeURIComponent(record.farmerId)}" data-profile-click>プロフィールを見る</a></div>
      `;
      window.YNHAnalytics?.track("page_view", { recordId: record.id, farmerId: record.farmerId });
      $("[data-public-video]")?.addEventListener("play", () => window.YNHAnalytics?.track("video_play", { recordId: record.id, farmerId: record.farmerId }), { once: true });
      $("[data-public-video]")?.addEventListener("ended", () => window.YNHAnalytics?.track("video_ended", { recordId: record.id, farmerId: record.farmerId }));
      $("[data-profile-click]")?.addEventListener("click", () => window.YNHAnalytics?.track("profile_click", { recordId: record.id, farmerId: record.farmerId }));
    } catch (error) {
      container.innerHTML = `
        <p class="eyebrow">QRから見る</p>
        <h1>まだコンテンツは登録されていません</h1>
        <p class="lead">このページに表示する動画や写真は、まだ登録されていません。</p>
      `;
    }
  }

  async function setupPublicProfile() {
    const container = $("[data-farmer-public]");
    const id = new URLSearchParams(location.search).get("id") || "id-01";
    if (!container) return;
    try {
      const [profileData, recordData] = await Promise.all([fetchJson(`/api/farmer/${encodeURIComponent(id)}`), fetchJson(`/api/farmer/${encodeURIComponent(id)}/harvests`)]);
      const profile = profileData.farmer;
      const records = (recordData.records || []).filter(hasRecordContent);
      document.title = `${profile.name} | 軌跡`;
      container.innerHTML = `
        <div class="public-profile-shell">
          <article class="public-profile-hero-card">
            ${profile.imageUrl ? `<div class="public-profile-hero-image"><img src="${escapeHtml(profile.imageUrl)}" alt="${escapeHtml(profile.name)}"></div>` : ""}
            <div class="public-profile-hero-copy">
              <p class="eyebrow">プロフィール</p>
              <h1>${escapeHtml(profile.name)}</h1>
              <p class="public-profile-area">${escapeHtml(profile.area || "地域未設定")}</p>
              <p>${escapeHtml(createProfileLead(profile))}</p>
            </div>
          </article>

          ${renderProfileLatestVideo(records)}

          <section class="public-profile-card public-profile-trace-card">
            <p class="eyebrow">動画と写真でたどる</p>
            <h2>最近の様子</h2>
            <p>日ごとの動画や写真を、新しい順に見ることができます。</p>
            <div class="actions"><a class="button primary-button" href="records.html?id=${encodeURIComponent(profile.id)}">これまでの記録を見る</a></div>
          </section>

          <section class="public-profile-card public-profile-story-card">
            <p class="eyebrow">想い</p>
            <h2>${escapeHtml(createProfileStoryTitle(profile))}</h2>
            <p>${escapeHtml(profile.description || "紹介文は準備中です。")}</p>
          </section>

          ${renderProfileInfoCard(profile)}
          ${renderProfileLinkCard(profile.links)}
        </div>
      `;
    } catch (error) {
      container.innerHTML = `<h1>プロフィールが見つかりません</h1><p class="lead">${escapeHtml(error.message)}</p>`;
    }
  }

  function createProfileLead(profile) {
    const description = String(profile.description || "").trim();
    if (!description) return "その日の動画や写真と一緒に、背景にある想いを届けます。";
    return description.split(/[。！？]/).filter(Boolean).slice(0, 1).join("。") + "。";
  }

  function createProfileStoryTitle(profile) {
    const area = profile.area ? `${profile.area}で、` : "";
    return `${area}日々を続ける`;
  }

  function renderProfileLatestVideo(records) {
    const latest = records.find(hasRecordContent);
    if (!latest) {
      return `
        <section class="public-profile-card">
          <h2>最近の動画</h2>
          <p class="note">最近の動画はまだありません。</p>
        </section>`;
    }
    const href = `harvest.html?id=${encodeURIComponent(latest.id)}`;
    const thumb = latest.videoThumbnailUrl || "";
    return `
      <section class="public-profile-card public-profile-video-card" aria-labelledby="latest-video-title">
        <h2 id="latest-video-title">最近の動画</h2>
        <a class="public-profile-video-link" href="${href}">
          <span class="public-profile-video-thumb">
            ${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : `<span class="public-profile-video-placeholder">▶</span>`}
          </span>
          <span>
            <small>${escapeHtml(formatDateJa(latest.date))}</small>
            <strong>${escapeHtml(latest.title || "今日の軌跡")}</strong>
            ${latest.note ? `<em>${escapeHtml(latest.note)}</em>` : ""}
          </span>
          <b aria-hidden="true">→</b>
        </a>
      </section>`;
  }

  function renderProfileInfoCard(profile) {
    const rows = getProfileInfoRows(profile).filter((row) => row.value);
    if (!rows.length) return "";
    return `
      <section class="public-profile-card public-profile-info-card">
        <p class="eyebrow">基本情報</p>
        <dl>
          ${rows.map((row) => `
            <div>
              <dt>${escapeHtml(row.label)}</dt>
              <dd>${formatProfileInfoValue(row)}</dd>
            </div>
          `).join("")}
        </dl>
      </section>`;
  }

  function getProfileInfoRows(profile) {
    const rows = [
      { label: "地域", value: profile.area || "" },
    ];
    if (profile.id === "id-01") {
      rows.push(
        { label: "主な内容", value: "季節の野菜 / 多品目野菜" },
        { label: "販売", value: "直販（宅配便）" },
        { label: "住所", value: "石岡市太田 409-1" },
        { label: "TEL", value: "090-1734-9851", href: "tel:09017349851" },
        { label: "MAIL", value: "yamadayamadanouen@gmail.com", href: "mailto:yamadayamadanouen@gmail.com" },
      );
    }
    return rows;
  }

  function formatProfileInfoValue(row) {
    const text = escapeHtml(row.value);
    return row.href ? `<a href="${escapeHtml(row.href)}">${text}</a>` : text;
  }

  function renderProfileLinkCard(links) {
    if (!Array.isArray(links) || !links.length) return "";
    return `
      <section class="public-profile-card public-profile-links-card">
        <p class="eyebrow">関連リンク</p>
        <h2>最新情報は公式情報へ</h2>
        <div class="public-profile-link-list">
          ${links.map((item, index) => {
            const url = typeof item === "string" ? item : item.url;
            const label = typeof item === "string" ? `関連リンク ${index + 1}` : (item.label || `関連リンク ${index + 1}`);
            return `<a class="public-profile-link-chip" href="${escapeHtml(url)}" target="_blank" rel="noopener"><span>${escapeHtml(label)}</span><span aria-hidden="true">↗</span></a>`;
          }).join("")}
        </div>
      </section>`;
  }

  async function setupPublicRecords() {
    const container = $("[data-records-public]");
    const id = new URLSearchParams(location.search).get("id") || "id-01";
    if (!container) return;
    try {
      const [profileData, recordData] = await Promise.all([fetchJson(`/api/farmer/${encodeURIComponent(id)}`), fetchJson(`/api/farmer/${encodeURIComponent(id)}/harvests`)]);
      const profile = profileData.farmer;
      const records = (recordData.records || []).filter(hasRecordContent);
      document.title = `最近の${profile.name}の様子 | 軌跡`;
      container.innerHTML = `
        <p class="eyebrow">最近の様子</p>
        <h1>最近の${escapeHtml(profile.name)}の様子</h1>
        <p class="lead">日ごとの記録を新しい順に表示しています。</p>
        <div class="records-list">${records.map((record) => recordLink(record)).join("") || '<p class="note">まだコンテンツは登録されていません。</p>'}</div>
        <div class="actions"><a class="button" href="farmer.html?id=${encodeURIComponent(profile.id)}">プロフィールへ戻る</a></div>
      `;
    } catch (error) {
      container.innerHTML = `<h1>記録が見つかりません</h1><p class="lead">${escapeHtml(error.message)}</p>`;
    }
  }

  function recordLink(record) {
    return `<a class="record-row" href="harvest.html?id=${encodeURIComponent(record.id)}"><span><strong>${escapeHtml(record.title || "今日の軌跡")}</strong><br><span class="note">${escapeHtml(formatDateJa(record.date))}</span></span><span>見る →</span></a>`;
  }

  function hasRecordContent(record) {
    const photos = Array.isArray(record?.photoUrls) ? record.photoUrls : [];
    return Boolean(record?.videoUrl || photos.length);
  }

  function renderLinks(links) {
    if (!Array.isArray(links) || !links.length) return "";
    return `<div class="actions">${links.map((item, index) => {
      const url = typeof item === "string" ? item : item.url;
      const label = typeof item === "string" ? `関連リンク ${index + 1}` : (item.label || `関連リンク ${index + 1}`);
      return `<a class="button" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    }).join("")}</div>`;
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
    if (!rows.length) { container.innerHTML = '<p class="note">解析対象の記録はまだありません。</p>'; return; }
    container.innerHTML = `<table><thead><tr><th>recordId</th><th>タイトル</th><th>日付</th><th>PV</th><th>動画再生</th><th>動画完了</th><th>プロフィール遷移</th><th>再生率</th><th>完了率</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.title || row.productName || "")}</td><td>${escapeHtml(row.date)}</td><td>${row.pageViews}</td><td>${row.videoPlays}</td><td>${row.videoEnded}</td><td>${row.profileClicks}</td><td>${percent(row.playRate)}</td><td>${percent(row.completionRate)}</td></tr>`).join("")}</tbody></table>`;
  }

  function downloadAnalyticsCsv() {
    const header = ["recordId", "title", "date", "pageViews", "videoPlays", "videoEnded", "profileClicks", "playRate", "completionRate", "profileClickRate"];
    const rows = analyticsRows.map((row) => header.map((key) => JSON.stringify(row[key] ?? "")).join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "kiseki-analytics.csv";
    link.click();
  }

  function setupLightbox() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-lightbox-url]");
      if (!trigger) return;
      const url = trigger.dataset.lightboxUrl || "";
      if (!url) return;
      let box = $("[data-lightbox]");
      if (!box) {
        box = document.createElement("div");
        box.className = "lightbox";
        box.dataset.lightbox = "";
        box.innerHTML = '<button type="button" aria-label="閉じる">×</button><img alt="拡大写真">';
        document.body.appendChild(box);
        box.addEventListener("click", (e) => { if (e.target === box || e.target.tagName === "BUTTON") box.classList.remove("is-open"); });
      }
      $("img", box).src = url;
      box.classList.add("is-open");
    });
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "読み込みに失敗しました。");
    return data;
  }

  function createClientRecordId(profileId, date) {
    return `${sanitizeSegment(profileId, "id")}-${date}`;
  }

  function sanitizeSegment(value, fallback) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
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
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function percent(value) {
    return `${Math.round((Number(value) || 0) * 100)}%`;
  }
})();
