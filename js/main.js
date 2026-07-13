(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);

  let selectedVideoFile = null;
  let selectedPhotoFiles = [];
  let lastSavedRecord = null;
  let analyticsRows = [];

  document.addEventListener("DOMContentLoaded", async () => {
    window.YNHAuth?.setupLogout();
    let authState = null;
    if (document.body.hasAttribute("data-require-auth")) {
      authState = await window.YNHAuth.requireAuth();
      if (!authState) return;
      setupAuthenticatedNav(authState);
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

  function setupAuthenticatedNav(auth) {
    document.querySelectorAll("[data-records-link]").forEach((link) => {
      link.href = `records.html?id=${encodeURIComponent(auth.farmId)}`;
    });
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

  function formatOverlayDate(date) {
    const value = String(date || "");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
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
      isPublic: $('[name="isPublic"]', form),
    };
    const linkRows = Array.from(form.querySelectorAll("[data-profile-link-row]"));
    if (publicLink) publicLink.href = `farmer.html?id=${encodeURIComponent(auth.farmId)}`;

    try {
      const data = await window.YNHAuth.apiJson(`/api/farmer/${encodeURIComponent(auth.farmId)}`, { method: "GET" });
      const profile = data.farmer || {};
      fields.name.value = profile.name || "";
      fields.area.value = profile.area || "";
      fields.description.value = profile.description || "";
      fields.imageUrl.value = profile.imageUrl || "";
      populateProfileLinkRows(linkRows, profile.links || []);
      fields.isPublic.value = profile.isPublic === false ? "false" : "true";
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
      const links = collectProfileLinks(linkRows);
      try {
        await window.YNHAuth.apiJson("/api/farmer/save", {
          method: "POST",
          body: JSON.stringify({ name: fields.name.value, area: fields.area.value, description: fields.description.value, imageUrl: fields.imageUrl.value, links, isPublic: fields.isPublic.value !== "false" }),
        });
        status.textContent = "保存しました。";
        status.className = "status is-success";
      } catch (error) {
        status.textContent = error.message;
        status.className = "status is-error";
      }
    });
  }

  function populateProfileLinkRows(rows, links) {
    rows.forEach((row) => {
      const labelInput = row.querySelector('[name="linkLabel"]');
      const urlInput = row.querySelector('[name="linkUrl"]');
      if (labelInput) labelInput.value = "";
      if (urlInput) urlInput.value = "";
    });
    links.map(normalizeProfileLink).filter((item) => item.url).slice(0, 10).forEach((item, index) => {
      const row = rows[index];
      if (!row) return;
      const labelInput = row.querySelector('[name="linkLabel"]');
      const urlInput = row.querySelector('[name="linkUrl"]');
      if (labelInput) labelInput.value = item.label || displayLinkLabel(item.url);
      if (urlInput) urlInput.value = item.url;
    });
  }

  function collectProfileLinks(rows) {
    return rows.map((row) => {
      const label = row.querySelector('[name="linkLabel"]')?.value.trim() || "";
      const url = row.querySelector('[name="linkUrl"]')?.value.trim() || "";
      if (!url) return null;
      return { label: label || displayLinkLabel(url), url };
    }).filter(Boolean).slice(0, 10);
  }

  function normalizeProfileLink(item) {
    if (typeof item === "string") return { label: displayLinkLabel(item), url: item.trim() };
    const url = String(item?.url || "").trim();
    const label = String(item?.label || item?.name || "").trim() || displayLinkLabel(url);
    return { label, url };
  }

  function displayLinkLabel(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") || url;
    } catch (error) {
      return url || "関連リンク";
    }
  }

  function setupHarvestAdmin() {
    const form = $("[data-harvest-form]");
    if (!form) return;
    const status = $("[data-harvest-status]");
    const fields = { date: $('[name="date"]', form), title: $('[name="title"]', form), overlayText: $('[name="overlayText"]', form), note: $('[name="note"]', form) };
    const videoPreview = $("[data-video-preview]");
    const photoInput = $("[data-harvest-photos]");
    const photoPreview = $("[data-photo-preview]");
    const composerInput = $("[data-composer-input]");
    const resetComposerButton = $("[data-composer-reset]");
    const existingSelect = $("[data-existing-record-select]");
    const clearVideoButton = $("[data-clear-video]");
    const clearPhotosButton = $("[data-clear-photos]");
    const deleteButton = $("[data-delete-harvest]");
    const submitButton = $('button[type="submit"]', form);
    const auth = window.YNHAuth.state;
    const submitButtonLabel = submitButton?.textContent || "保存してQRコードを発行します";
    let existingRecords = [];
    let editingRecord = null;
    let existingVideoUrl = "";
    let existingVideoThumbnailUrl = "";
    let existingPhotoUrls = [];
    let isSaving = false;
    if (fields.date && !fields.date.value) fields.date.value = new Date().toISOString().slice(0, 10);

    const setFormSaving = (saving, buttonLabel, message) => {
      isSaving = saving;
      form.classList.toggle("is-saving", saving);
      if (submitButton) {
        submitButton.disabled = saving;
        submitButton.textContent = saving ? (buttonLabel || "保存しています...") : submitButtonLabel;
        submitButton.setAttribute("aria-busy", saving ? "true" : "false");
      }
      [deleteButton, clearVideoButton, clearPhotosButton, resetComposerButton].forEach((button) => {
        if (button) button.disabled = saving;
      });
      if (message) setStatus(status, message, false);
    };

    const friendlyHarvestError = (error) => {
      const message = String(error?.message || "");
      const lower = message.toLowerCase();
      if (lower.includes("unauthorized") || message.includes("ログイン")) return "ログイン状態を確認してください。もう一度ログインしてから保存してください。";
      if (lower.includes("failed to fetch") || lower.includes("network")) return "通信に失敗しました。電波状況を確認して、もう一度お試しください。";
      if (lower.includes("payload") || lower.includes("large") || lower.includes("413") || message.includes("アップロード")) return "保存できませんでした。動画や写真の容量が大きすぎる可能性があります。短い動画や枚数を減らしてお試しください。";
      return message || "保存できませんでした。入力内容と通信状況を確認して、もう一度お試しください。";
    };

    const updateEditControls = () => {
      if (clearVideoButton) clearVideoButton.hidden = !existingVideoUrl;
      if (clearPhotosButton) clearPhotosButton.hidden = !existingPhotoUrls.length;
      if (deleteButton) deleteButton.hidden = !editingRecord;
    };

    const hideQr = () => {
      const box = $("[data-qr-box]");
      if (box) box.hidden = true;
      lastSavedRecord = null;
    };

    const clearLoadedRecord = (clearFields) => {
      editingRecord = null;
      existingVideoUrl = "";
      existingVideoThumbnailUrl = "";
      existingPhotoUrls = [];
      selectedVideoFile = null;
      selectedPhotoFiles = [];
      if (composerInput) composerInput.value = "";
      if (photoInput) photoInput.value = "";
      if (clearFields) {
        fields.title.value = "";
        fields.overlayText.value = "";
        fields.note.value = "";
      }
      renderVideoPreview(videoPreview, null);
      renderPhotoPreview(photoPreview, []);
      updateEditControls();
      hideQr();
    };

    const setSelectedVideo = (file, message) => {
      selectedVideoFile = file || null;
      if (selectedVideoFile) {
        existingVideoUrl = "";
        existingVideoThumbnailUrl = "";
      }
      renderVideoPreview(videoPreview, selectedVideoFile || (existingVideoUrl ? { url: existingVideoUrl, poster: existingVideoThumbnailUrl, name: "\u767b\u9332\u6e08\u307f\u306e\u52d5\u753b" } : null));
      updateEditControls();
      if (message) setStatus(status, message, false, true);
    };

    const loadRecordForEdit = (record, message) => {
      editingRecord = record;
      fields.date.value = record.date || fields.date.value;
      fields.title.value = record.title || "";
      fields.overlayText.value = record.overlayText || "";
      fields.note.value = record.note || "";
      selectedVideoFile = null;
      selectedPhotoFiles = [];
      existingVideoUrl = record.videoUrl || "";
      existingVideoThumbnailUrl = record.videoThumbnailUrl || "";
      existingPhotoUrls = Array.isArray(record.photoUrls) ? record.photoUrls.slice() : [];
      if (composerInput) composerInput.value = "";
      if (photoInput) photoInput.value = "";
      if (existingSelect) existingSelect.value = record.id;
      renderVideoPreview(videoPreview, existingVideoUrl ? { url: existingVideoUrl, poster: existingVideoThumbnailUrl, name: "\u767b\u9332\u6e08\u307f\u306e\u52d5\u753b" } : null);
      renderPhotoPreview(photoPreview, existingPhotoUrls);
      lastSavedRecord = record;
      renderQr(record);
      updateEditControls();
      if (message) setStatus(status, "\u767b\u9332\u6e08\u307f\u306e\u5185\u5bb9\u3092\u8aad\u307f\u8fbc\u307f\u307e\u3057\u305f\u3002", false, true);
    };

    const renderExistingOptions = (selectedId) => {
      if (!existingSelect) return;
      existingSelect.innerHTML = '<option value="">\u767b\u9332\u6e08\u307f\u306e\u6295\u7a3f\u65e5\u3092\u9078\u629e</option>' + existingRecords.map((record) => {
        const selected = record.id === selectedId ? " selected" : "";
        const label = `${record.date || ""} ${record.title || "\u7121\u984c"}`.trim();
        return `<option value="${escapeHtml(record.id)}"${selected}>${escapeHtml(label)}</option>`;
      }).join("");
    };

    const loadExistingRecords = async (selectedId) => {
      try {
        const data = await window.YNHAuth.apiJson(`/api/farmer/${encodeURIComponent(auth.farmId)}/harvests`, { method: "GET" });
        existingRecords = data.records || [];
        renderExistingOptions(selectedId);
      } catch (error) {
        if (existingSelect) existingSelect.innerHTML = '<option value="">\u767b\u9332\u6e08\u307f\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f</option>';
      }
    };

    const findRecordByDate = (date) => existingRecords.find((record) => record.date === date);

    loadExistingRecords();

    existingSelect?.addEventListener("change", () => {
      const record = existingRecords.find((item) => item.id === existingSelect.value);
      if (record) loadRecordForEdit(record, true);
    });

    fields.date?.addEventListener("change", () => {
      const record = findRecordByDate(fields.date.value);
      if (record) {
        loadRecordForEdit(record, true);
      } else if (editingRecord) {
        if (existingSelect) existingSelect.value = "";
        clearLoadedRecord(true);
      }
    });

    composerInput?.addEventListener("change", () => {
      const files = Array.from(composerInput.files || []).filter((item) => item.type.startsWith("video/"));
      if (!files.length) {
        setSelectedVideo(null, "");
        return;
      }
      if (files.length === 1) {
        setSelectedVideo(files[0], "\u9078\u3093\u3060\u52d5\u753b\u3092\u300c\u767b\u9332\u3059\u308b\u52d5\u753b\u300d\u306b\u30bb\u30c3\u30c8\u3057\u307e\u3057\u305f\u3002");
        return;
      }
      setSelectedVideo(null, "\u8907\u6570\u306e\u52d5\u753b\u3092\u9078\u3093\u3067\u3044\u307e\u3059\u3002\u300c\u52d5\u753b\u3092\u3064\u306a\u3050\u300d\u3092\u62bc\u3059\u3068\u3001\u5b8c\u6210\u3057\u305f\u52d5\u753b\u304c\u300c\u767b\u9332\u3059\u308b\u52d5\u753b\u300d\u306b\u30bb\u30c3\u30c8\u3055\u308c\u307e\u3059\u3002");
    });

    resetComposerButton?.addEventListener("click", () => {
      setSelectedVideo(null, "");
    });

    clearVideoButton?.addEventListener("click", () => {
      selectedVideoFile = null;
      existingVideoUrl = "";
      existingVideoThumbnailUrl = "";
      if (composerInput) composerInput.value = "";
      renderVideoPreview(videoPreview, null);
      updateEditControls();
      setStatus(status, "\u767b\u9332\u6e08\u307f\u52d5\u753b\u3092\u524a\u9664\u5bfe\u8c61\u306b\u3057\u307e\u3057\u305f\u3002\u4fdd\u5b58\u3059\u308b\u3068\u53cd\u6620\u3055\u308c\u307e\u3059\u3002", false, true);
    });

    clearPhotosButton?.addEventListener("click", () => {
      selectedPhotoFiles = [];
      existingPhotoUrls = [];
      if (photoInput) photoInput.value = "";
      renderPhotoPreview(photoPreview, []);
      updateEditControls();
      setStatus(status, "\u767b\u9332\u6e08\u307f\u5199\u771f\u3092\u524a\u9664\u5bfe\u8c61\u306b\u3057\u307e\u3057\u305f\u3002\u4fdd\u5b58\u3059\u308b\u3068\u53cd\u6620\u3055\u308c\u307e\u3059\u3002", false, true);
    });

    deleteButton?.addEventListener("click", async () => {
      if (isSaving) return;
      if (!editingRecord) return;
      if (!window.confirm("\u3053\u306e\u6295\u7a3f\u65e5\u306e\u8a18\u9332\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f")) return;
      try {
        setFormSaving(true, "削除しています...", "\u524a\u9664\u3057\u3066\u3044\u307e\u3059...");
        await window.YNHAuth.apiJson(`/api/harvest/${encodeURIComponent(editingRecord.id)}`, { method: "DELETE" });
        fields.title.value = "";
        fields.overlayText.value = "";
        fields.note.value = "";
        clearLoadedRecord(false);
        if (existingSelect) existingSelect.value = "";
        await loadExistingRecords();
        setStatus(status, "\u524a\u9664\u3057\u307e\u3057\u305f\u3002", false, true);
      } catch (error) {
        setStatus(status, friendlyHarvestError(error), true);
      } finally {
        setFormSaving(false);
      }
    });

    document.addEventListener("harvest-composed-video-ready", (event) => {
      const file = event.detail?.file;
      if (!(file instanceof File)) return;
      setSelectedVideo(file, "\u3064\u306a\u3044\u3060\u52d5\u753b\u3092\u300c\u767b\u9332\u3059\u308b\u52d5\u753b\u300d\u306b\u30bb\u30c3\u30c8\u3057\u307e\u3057\u305f\u3002");
    });

    photoInput?.addEventListener("change", () => {
      const files = Array.from(photoInput.files || []);
      if (!files.length) return;
      selectedPhotoFiles = files;
      existingPhotoUrls = [];
      renderPhotoPreview(photoPreview, selectedPhotoFiles);
      updateEditControls();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (isSaving) return;
      const date = fields.date.value;
      if (!date) return setStatus(status, "\u6295\u7a3f\u65e5\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002", true);
      if (!selectedVideoFile && !existingVideoUrl && !selectedPhotoFiles.length && !existingPhotoUrls.length) return setStatus(status, "\u52d5\u753b\u307e\u305f\u306f\u5199\u771f\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002", true);

      try {
        setFormSaving(true, "保存しています...", "保存を開始しています。画面を閉じずにお待ちください。");
        const recordId = createClientRecordId(auth.farmId, date);
        let uploadData = { videoUrl: "", videoThumbnailUrl: "", photoUrls: [] };
        if (selectedVideoFile || selectedPhotoFiles.length) {
          setFormSaving(true, "アップロード中...", "動画と写真を保存しています。容量によって少し時間がかかります。");
          const uploadForm = new FormData();
          uploadForm.append("recordId", recordId);
          if (selectedVideoFile) uploadForm.append("video", selectedVideoFile);
          selectedPhotoFiles.forEach((file) => uploadForm.append("photo", file));
          const uploadResponse = await fetch("/api/harvest/upload", { method: "POST", credentials: "include", body: uploadForm });
          uploadData = await uploadResponse.json();
          if (!uploadResponse.ok) throw new Error(uploadData.error || "\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002");
        }

        const finalVideoUrl = selectedVideoFile ? uploadData.videoUrl : existingVideoUrl;
        const finalVideoThumbnailUrl = selectedVideoFile ? (uploadData.videoThumbnailUrl || existingVideoThumbnailUrl) : existingVideoThumbnailUrl;
        const finalPhotoUrls = selectedPhotoFiles.length ? uploadData.photoUrls : existingPhotoUrls;

        setFormSaving(true, "記録を保存中...", "\u8a18\u9332\u3092\u4fdd\u5b58\u3057\u3066\u3044\u307e\u3059...");
        const saveData = await window.YNHAuth.apiJson("/api/harvest/save", {
          method: "POST",
          body: JSON.stringify({ date, productName: "", title: fields.title.value.trim(), overlayText: fields.overlayText.value.trim(), note: fields.note.value.trim(), videoUrl: finalVideoUrl, videoThumbnailUrl: finalVideoThumbnailUrl, photoUrls: finalPhotoUrls }),
        });
        lastSavedRecord = saveData.record;
        loadRecordForEdit(saveData.record, false);
        renderQr(saveData.record);
        await loadExistingRecords(saveData.record.id);
        setStatus(status, "\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002QR\u3092\u767a\u884c\u3057\u307e\u3057\u305f\u3002", false, true);
        $("[data-qr-box]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) {
        setStatus(status, friendlyHarvestError(error), true);
      } finally {
        setFormSaving(false);
      }
    });

    $("[data-copy-url]")?.addEventListener("click", async () => {
      if (!lastSavedRecord) return;
      await navigator.clipboard?.writeText(getPublicHarvestUrl(lastSavedRecord.id));
      setStatus(status, "\u516c\u958bURL\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f\u3002", false, true);
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


  function renderVideoPreview(container, source) {
    if (!container) return;
    if (!source) {
      container.innerHTML = "";
      return;
    }
    const isFile = source instanceof File;
    const url = isFile ? URL.createObjectURL(source) : String(source.url || source || "");
    const poster = !isFile && source.poster ? ` poster="${escapeHtml(source.poster)}"` : "";
    const label = isFile ? `${escapeHtml(source.name)} / ${formatBytes(source.size)}` : escapeHtml(source.name || "\u767b\u9332\u6e08\u307f\u306e\u52d5\u753b");
    container.innerHTML = `<div class="video-box"><video src="${escapeHtml(url)}"${poster} controls playsinline preload="metadata"></video></div><p class="note">${label}</p>`;
  }

  function renderPhotoPreview(container, items) {
    if (!container) return;
    if (!items.length) { container.innerHTML = ""; return; }
    container.innerHTML = items.map((item, index) => {
      const url = item instanceof File ? URL.createObjectURL(item) : String(item.url || item || "");
      return `<img src="${escapeHtml(url)}" alt="photo ${index + 1}">`;
    }).join("");
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
      const likes = Math.max(0, Number(record.likes || 0));
      if (!hasRecordContent(record)) {
        document.title = "まだコンテンツは登録されていません | 軌跡";
        container.innerHTML = `
          <h1>まだコンテンツは登録されていません</h1>
          <p class="lead">このページに表示する動画や写真は、まだ登録されていません。</p>
          <div class="actions"><a class="button primary-button" href="farmer.html?id=${encodeURIComponent(record.farmerId)}">プロフィールを見る</a></div>
        `;
        return;
      }
      document.title = `${displayTitle} | 軌跡`;
      container.innerHTML = `
        ${record.videoUrl ? `
          <header class="public-video-title-bar">
            <h1 data-auto-fit-title title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h1>
          </header>
          <section class="public-video-first-view" aria-label="${escapeHtml(displayTitle)}の動画">
            <video src="${escapeHtml(record.videoUrl)}" poster="${escapeHtml(record.videoThumbnailUrl || "")}" controls playsinline preload="metadata" data-public-video></video>
            <div class="public-video-story-overlay" data-public-video-overlay aria-hidden="true">
              <time datetime="${escapeHtml(record.date)}">${escapeHtml(formatOverlayDate(record.date))}</time>
              ${record.overlayText ? `<p>${escapeHtml(record.overlayText)}</p>` : ""}
            </div>
            <button class="public-video-start" type="button" data-public-video-start aria-label="動画を再生する">
              <span class="public-video-guide" aria-hidden="true">↓</span>
              <span class="public-video-play-icon" aria-hidden="true">▶</span>
              <strong>農家さんからの動画を見る</strong>
              <small>タップして再生</small>
            </button>
            <button class="public-video-after-guide" type="button" data-public-video-after aria-label="写真とプロフィールを見る">
              <small>動画の下に続きがあります</small>
              <strong>写真とプロフィールを見る</strong>
              <span aria-hidden="true">↓</span>
            </button>
            <a class="public-video-scroll-cue" href="#public-story" aria-label="動画の下の内容を見る">⌄</a>
          </section>` : ""}
        <div class="public-story" id="public-story">
          ${record.videoUrl ? "" : `<h1 data-auto-fit-title title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h1><p class="note">この日の動画はまだありません。</p>`}
          <p class="public-story-meta">${escapeHtml(formatDateJa(record.date))} / ${escapeHtml(profile?.name || record.farmerId)}</p>
          <section class="public-story-note" aria-labelledby="public-story-note-title">
            <h2 id="public-story-note-title">ひとこと</h2>
            <p>${record.note ? escapeHtml(record.note) : "この日のひとことはまだありません。"}</p>
          </section>
          <div class="public-reaction" aria-label="いいね">
            <button class="like-button" type="button" data-like-button data-like-count="${likes}">
              <span data-like-label>いいね</span>
              <strong data-like-count-label>${likes}</strong>
            </button>
            <p class="note" data-like-note>この軌跡がよかったら押してください。</p>
          </div>
          <section class="public-gallery" aria-label="写真ギャラリー">
            <h2>写真ギャラリー</h2>
            <p class="note gallery-note">動画と一緒に残された写真です。タップすると拡大できます。</p>
            <div class="photo-grid">${photos.length ? photos.map((url, index) => `<button class="public-photo-link" type="button" data-lightbox-url="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="写真 ${index + 1}"></button>`).join("") : '<p class="note">この日の写真はまだありません。</p>'}</div>
          </section>
          <div class="actions"><a class="button primary-button" href="farmer.html?id=${encodeURIComponent(record.farmerId)}" data-profile-click>プロフィールを見る</a></div>
        </div>
      `;
      window.YNHAnalytics?.track("page_view", { recordId: record.id, farmerId: record.farmerId });
      setupAutoFitTitle($("[data-auto-fit-title]", container));
      setupPublicVideo($("[data-public-video]"), record);
      $("[data-profile-click]")?.addEventListener("click", () => window.YNHAnalytics?.track("profile_click", { recordId: record.id, farmerId: record.farmerId }));
      setupLikeButton($("[data-like-button]", container), record);
    } catch (error) {
      container.innerHTML = `
        <h1>まだコンテンツは登録されていません</h1>
        <p class="lead">このページに表示する動画や写真は、まだ登録されていません。</p>
      `;
    }
  }

  function setupAutoFitTitle(title) {
    if (!title) return;
    const fit = () => {
      const maxSize = window.matchMedia("(max-width: 760px)").matches ? 42 : 54;
      const minSize = 15;
      let low = minSize;
      let high = maxSize;
      title.style.fontSize = `${maxSize}px`;
      for (let i = 0; i < 8; i += 1) {
        const size = (low + high) / 2;
        title.style.fontSize = `${size}px`;
        if (title.scrollWidth <= title.clientWidth) low = size;
        else high = size;
      }
      title.style.fontSize = `${Math.floor(low)}px`;
    };
    fit();
    if (document.fonts?.ready) document.fonts.ready.then(fit).catch(() => {});
    if (window.ResizeObserver) new ResizeObserver(fit).observe(title.parentElement || title);
    else window.addEventListener("resize", fit, { passive: true });
  }

  function setupPublicVideo(video, record) {
    if (!video || !record?.id) return;
    const firstView = video.closest(".public-video-first-view");
    const startButton = firstView?.querySelector("[data-public-video-start]");
    const afterGuide = firstView?.querySelector("[data-public-video-after]");
    const storyOverlay = firstView?.querySelector("[data-public-video-overlay]");
    const story = document.querySelector("#public-story");
    const nativeOverlayTrack = setupNativeVideoOverlay(video, record);
    let hasPlayed = false;
    let hasEnded = false;

    startButton?.addEventListener("click", () => {
      startButton.classList.add("is-starting");
      const playback = video.play();
      enterVideoFullscreen(video, nativeOverlayTrack);
      playback?.catch(() => {
        startButton.classList.remove("is-starting");
        startButton.querySelector("strong").textContent = "もう一度タップして再生";
      });
    });

    video.addEventListener("play", () => {
      firstView?.classList.add("is-playing");
      firstView?.classList.remove("is-ended");
      updateVideoStoryOverlay(video, storyOverlay);
      if (!hasPlayed) {
        hasPlayed = true;
        window.YNHAnalytics?.track("video_play", { recordId: record.id, farmerId: record.farmerId });
      }
    });

    video.addEventListener("timeupdate", () => updateVideoStoryOverlay(video, storyOverlay));
    video.addEventListener("pause", () => storyOverlay?.classList.remove("is-visible"));
    video.addEventListener("webkitbeginfullscreen", () => setNativeOverlayTrack(nativeOverlayTrack, true));
    video.addEventListener("webkitendfullscreen", () => setNativeOverlayTrack(nativeOverlayTrack, false));
    document.addEventListener("fullscreenchange", () => {
      setNativeOverlayTrack(nativeOverlayTrack, document.fullscreenElement === video);
    });
    document.addEventListener("webkitfullscreenchange", () => {
      setNativeOverlayTrack(nativeOverlayTrack, document.webkitFullscreenElement === video);
    });

    video.addEventListener("ended", () => {
      firstView?.classList.remove("is-playing");
      firstView?.classList.add("is-ended");
      storyOverlay?.classList.remove("is-visible");
      startButton?.classList.remove("is-starting");
      if (hasPlayed && !hasEnded) {
        hasEnded = true;
        window.YNHAnalytics?.track("video_ended", { recordId: record.id, farmerId: record.farmerId });
      }
      exitVideoFullscreen();
    });

    afterGuide?.addEventListener("click", () => {
      story?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function updateVideoStoryOverlay(video, overlay) {
    if (!video || !overlay) return;
    overlay.classList.toggle("is-visible", !video.paused && !video.ended && video.currentTime < 4);
  }

  function setupNativeVideoOverlay(video, record) {
    if (!video?.addTextTrack || !window.VTTCue) return null;
    const track = video.addTextTrack("captions", "軌跡", "ja");
    track.mode = "hidden";
    const dateCue = new VTTCue(0.15, 4.85, formatOverlayDate(record.date));
    dateCue.snapToLines = false;
    dateCue.line = 6;
    dateCue.position = 5;
    dateCue.size = 40;
    dateCue.align = "start";
    try { dateCue.positionAlign = "line-left"; } catch (error) {}
    track.addCue(dateCue);
    if (record.overlayText) {
      const textCue = new VTTCue(0.25, 4.75, record.overlayText);
      textCue.snapToLines = false;
      textCue.line = 18;
      textCue.position = 50;
      textCue.size = 88;
      textCue.align = "center";
      track.addCue(textCue);
    }
    return track;
  }

  function setNativeOverlayTrack(track, visible) {
    if (track) track.mode = visible ? "showing" : "hidden";
  }

  function enterVideoFullscreen(video, nativeOverlayTrack) {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      setNativeOverlayTrack(nativeOverlayTrack, true);
      if (video?.requestFullscreen) {
        const request = video.requestFullscreen();
        if (request?.catch) request.catch(() => setNativeOverlayTrack(nativeOverlayTrack, false));
      } else if (video?.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else {
        setNativeOverlayTrack(nativeOverlayTrack, false);
      }
    } catch (error) {
      // Fullscreen may be blocked by the browser if it is not treated as a user action.
    }
  }

  function exitVideoFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          const exit = document.exitFullscreen();
          if (exit?.catch) exit.catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch (error) {
      // Some mobile browsers handle native video fullscreen outside the standard API.
    }
  }

  function setupLikeButton(button, record) {
    if (!button || !record?.id) return;
    const label = $("[data-like-label]", button);
    const countLabel = $("[data-like-count-label]", button);
    const note = $("[data-like-note]");
    let count = Math.max(0, Number(button.dataset.likeCount || record.likes || 0));
    let liked = hasLikedRecord(record.id);

    const update = () => {
      button.classList.toggle("is-liked", liked);
      button.setAttribute("aria-pressed", liked ? "true" : "false");
      button.disabled = liked;
      if (label) label.textContent = liked ? "いいね済み" : "いいね";
      if (countLabel) countLabel.textContent = String(count);
      if (note) note.textContent = liked ? "ありがとうございます。" : "この軌跡がよかったら押してください。";
    };

    update();
    button.addEventListener("click", () => {
      if (liked) return;
      liked = true;
      count += 1;
      markRecordLiked(record.id);
      update();
      window.YNHAnalytics?.track("like_click", { recordId: record.id, farmerId: record.farmerId });
    });
  }

  function hasLikedRecord(recordId) {
    return getLikedRecords().has(String(recordId || ""));
  }

  function markRecordLiked(recordId) {
    const liked = getLikedRecords();
    liked.add(String(recordId || ""));
    try {
      window.localStorage.setItem("ynh_liked_records", JSON.stringify(Array.from(liked).slice(-500)));
    } catch (error) {
      // localStorageが使えない環境では、その場の表示だけ更新する。
    }
  }

  function getLikedRecords() {
    try {
      const raw = window.localStorage.getItem("ynh_liked_records") || "[]";
      const list = JSON.parse(raw);
      return new Set(Array.isArray(list) ? list.map(String) : []);
    } catch (error) {
      return new Set();
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
              <p class="public-profile-description">${escapeHtml(profile.description || "紹介文は準備中です。")}</p>
            </div>
          </article>

          ${renderProfileLatestVideo(records)}

          <section class="public-profile-card public-profile-trace-card">
            <p class="eyebrow">動画と写真でたどる</p>
            <h2>最近の様子</h2>
            <p>日ごとの動画や写真を、新しい順に見ることができます。</p>
            <div class="actions"><a class="button primary-button" href="records.html?id=${encodeURIComponent(profile.id)}">これまでの記録を見る</a></div>
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
    const videoPreview = !thumb && latest.videoUrl ? latest.videoUrl : "";
    return `
      <section class="public-profile-card public-profile-video-card" aria-labelledby="latest-video-title">
        <h2 id="latest-video-title">最近の動画</h2>
        <a class="public-profile-video-link" href="${href}">
          <span class="public-profile-video-thumb">
            ${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : (videoPreview ? `<video src="${escapeHtml(videoPreview)}" muted playsinline preload="metadata"></video>` : `<span class="public-profile-video-placeholder">▶</span>`)}
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
      { label: "拠点・地域", value: profile.area || "" },
    ];
    if (profile.id === "id-01") {
      rows.push(
        { label: "扱っているもの", value: "季節の野菜 / 多品目野菜" },
        { label: "購入・依頼方法", value: "直販" },
        { label: "受け取り・配送方法", value: "宅配便" },
        { label: "見学・来店", value: "事前にお問い合わせください" },
        { label: "所在地", value: "石岡市太田 409-1" },
        { label: "電話", value: "090-1734-9851", href: "tel:09017349851" },
        { label: "メール", value: "yamadayamadanouen@gmail.com", href: "mailto:yamadayamadanouen@gmail.com" },
      );
    }
    return rows;
  }

  function formatProfileInfoValue(row) {
    const text = escapeHtml(row.value);
    return row.href ? `<a href="${escapeHtml(row.href)}">${text}</a>` : text;
  }

  function renderProfileLinkCard(links) {
    const normalized = Array.isArray(links) ? links.map(normalizeProfileLink).filter((item) => item.url).slice(0, 10) : [];
    if (!normalized.length) return "";
    return `
      <section class="public-profile-card public-profile-links-card">
        <p class="eyebrow">関連リンク</p>
        <h2>最新情報は公式情報へ</h2>
        <div class="public-profile-link-list">
          ${normalized.map((item) => `<a class="public-profile-link-chip" href="${escapeHtml(item.url)}" target="_blank" rel="noopener"><span>${escapeHtml(item.label || displayLinkLabel(item.url))}</span><span aria-hidden="true">↗</span></a>`).join("")}
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
    container.innerHTML = `<table><thead><tr><th>recordId</th><th>タイトル</th><th>日付</th><th>PV</th><th>動画再生</th><th>動画完了</th><th>プロフィール遷移</th><th>いいね</th><th>再生率</th><th>完了率</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.title || row.productName || "")}</td><td>${escapeHtml(row.date)}</td><td>${row.pageViews}</td><td>${row.videoPlays}</td><td>${row.videoEnded}</td><td>${row.profileClicks}</td><td>${row.likeClicks || 0}</td><td>${percent(row.playRate)}</td><td>${percent(row.completionRate)}</td></tr>`).join("")}</tbody></table>`;
  }

  function downloadAnalyticsCsv() {
    const header = ["recordId", "title", "date", "pageViews", "videoPlays", "videoEnded", "profileClicks", "likeClicks", "playRate", "completionRate", "profileClickRate"];
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
