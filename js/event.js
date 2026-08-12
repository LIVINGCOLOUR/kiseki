(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  let eventState = null;
  let mediaStream = null;
  let recorder = null;
  let chunks = [];
  let eventCommonComposedFile = null;
  let handoffProcessing = false;

  document.addEventListener("DOMContentLoaded", async () => {
    window.YNHAuth?.setupLogout();
    if (document.body.hasAttribute("data-require-auth")) {
      const auth = await window.YNHAuth.requireAuth();
      if (!auth) return;
    }
    if (document.body.hasAttribute("data-event-admin")) setupAdmin();
    if (document.body.hasAttribute("data-event-handoff")) setupHandoff();
    if (document.body.hasAttribute("data-event-public")) setupPublic();
  });

  async function setupAdmin() {
    const form = $("[data-event-create-form]");
    const workspace = $("[data-event-workspace]");
    const status = $("[data-event-status]");
    const today = new Date().toISOString().slice(0, 10);
    $("#eventDate").value = today;
    await loadEventHistory();
    document.addEventListener("harvest-composed-video-ready", (event) => {
      if (!document.body.hasAttribute("data-event-admin")) return;
      eventCommonComposedFile = event.detail?.file || null;
      const status = $("[data-common-status]");
      if (status && eventCommonComposedFile) { status.textContent = "共通動画をつなぎました。内容を確認してアップロードしてください。"; status.className = "status is-success"; }
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "QRカードを発行しています…";
      try {
        const editId = form.dataset.editId;
        const payload = { name: $("#eventName").value, eventDate: $("#eventDate").value, title: $("#eventTitle").value, overlayText: $("#eventOverlayText").value, count: $("#eventCount").value };
        const data = editId
          ? await window.YNHAuth.apiJson(`/api/events/${encodeURIComponent(editId)}`, { method: "PATCH", body: JSON.stringify({ ...payload, commonVideoUrl: eventState?.commonVideoUrl || "" }) })
          : await window.YNHAuth.apiJson("/api/events/create", { method: "POST", body: JSON.stringify(payload) });
        if (editId) {
          await uploadEventThumbnailIfSelected();
          status.textContent = "イベント情報を更新しました。";
          showResumeActions(editId);
          await loadEventHistory();
          return;
        }
        eventState = { ...data.event, cards: data.event.cards };
        await uploadEventThumbnailIfSelected();
        renderAdminWorkspace(workspace);
        form.hidden = true;
        workspace.hidden = false;
        status.textContent = "";
      } catch (error) { status.textContent = error.message; status.className = "status is-error"; }
    });
    $("[data-upload-common]")?.addEventListener("click", uploadCommonVideo);
    $("[data-event-thumbnail]")?.addEventListener("change", previewEventThumbnail);
    $("[data-print-cards]")?.addEventListener("click", () => window.print());
    const existingId = new URLSearchParams(location.search).get("id");
    if (existingId) {
      try { const data = await window.YNHAuth.apiJson(`/api/events/${encodeURIComponent(existingId)}`, { method: "GET" }); eventState = { ...data.event, cards: data.cards }; form.hidden = true; workspace.hidden = false; renderAdminWorkspace(workspace); } catch (error) { status.textContent = error.message; status.className = "status is-error"; }
    }
    const editId = new URLSearchParams(location.search).get("edit");
    if (editId) {
      try {
        const data = await window.YNHAuth.apiJson(`/api/events/${encodeURIComponent(editId)}`, { method: "GET" });
        eventState = { ...data.event, cards: data.cards };
        form.dataset.editId = editId;
        $("#eventName").value = eventState.name || "";
        $("#eventDate").value = eventState.eventDate || today;
        $("#eventTitle").value = eventState.title || "";
        $("#eventOverlayText").value = eventState.overlayText || "";
        $("#eventCount").value = eventState.cards.length || 1;
        $("[data-event-status]").textContent = "イベント情報を編集しています。";
        $("[data-event-create-form] button[type=submit]").textContent = "イベント情報を更新";
        showResumeActions(editId);
      } catch (error) { status.textContent = error.message; status.className = "status is-error"; }
    }
  }

  function showResumeActions(eventId) {
    const actions = $("[data-event-resume-actions]");
    if (!actions || !eventId) return;
    actions.hidden = false;
    $("[data-event-resume-link]", actions).href = `event-handoff.html?event=${encodeURIComponent(eventId)}`;
    $("[data-event-workspace-link]", actions).href = `event-admin.html?id=${encodeURIComponent(eventId)}`;
  }

  function previewEventThumbnail() { const input = $("[data-event-thumbnail]"); const image = $("[data-event-thumbnail-preview]"); const file = input?.files?.[0]; if (!image) return; image.hidden = !file; if (file) image.src = URL.createObjectURL(file); }

  async function loadEventHistory() {
    const target = $("[data-event-history-list]");
    if (!target) return;
    try {
      const data = await window.YNHAuth.apiJson("/api/events", { method: "GET" });
      if (!data.events?.length) { target.innerHTML = '<p class="note">過去のイベントはまだありません。</p>'; return; }
      target.innerHTML = `<div class="event-history-list">${data.events.map((event) => `<article class="event-history-row"><div><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.eventDate)} / ${escapeHtml(event.status || "準備中")}</small></div><div class="actions"><a class="button primary-button" href="event-handoff.html?event=${encodeURIComponent(event.id)}">撮影を再開</a><a class="button" href="event-admin.html?edit=${encodeURIComponent(event.id)}">編集</a><button class="button danger-button" type="button" data-delete-event="${escapeHtml(event.id)}">削除</button></div></article>`).join("")}</div>`;
      target.querySelectorAll("[data-delete-event]").forEach((button) => button.addEventListener("click", () => deleteEvent(button.dataset.deleteEvent)));
      await enrichEventHistoryVideos(target);
    } catch (error) { target.innerHTML = `<p class="status is-error">${escapeHtml(error.message)}</p>`; }
  }

  async function enrichEventHistoryVideos(target) {
    const buttons = Array.from(target.querySelectorAll("[data-delete-event]"));
    await Promise.all(buttons.map(async (button) => {
      try {
        const data = await window.YNHAuth.apiJson(`/api/events/${encodeURIComponent(button.dataset.deleteEvent)}`, { method: "GET" });
        const row = button.closest(".event-history-row");
        if (!row) return;
        const area = row.querySelector("[data-history-videos]") || (() => { const el = document.createElement("div"); el.className = "actions event-history-videos"; el.dataset.historyVideos = ""; row.firstElementChild?.appendChild(el); return el; })();
        const links = [];
        if (data.event?.commonVideoUrl) links.push(`<a class="button" href="${escapeHtml(data.event.commonVideoUrl)}" target="_blank" rel="noopener">共通動画</a>`);
        (data.cards || []).forEach((card) => { const url = card.finalVideoUrl || card.handoffVideoUrl; if (url) links.push(`<a class="button" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(card.cardCode)}動画</a>`); });
        area.innerHTML = links.join("");
      } catch {}
    }));
  }

  async function deleteEvent(id) {
    if (!id || !window.confirm("このイベントとQRカード、登録済み動画を削除しますか？")) return;
    try {
      await window.YNHAuth.apiJson(`/api/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadEventHistory();
    } catch (error) { window.alert(error.message); }
  }

  function renderAdminWorkspace(workspace) {
    $("[data-event-name]").textContent = `${eventState.name}（${eventState.eventDate}）`;
    $("[data-handoff-link]").href = `event-handoff.html?event=${encodeURIComponent(eventState.id)}`;
    const grid = $("[data-event-qr-grid]");
    grid.innerHTML = eventState.cards.map((card) => `<article class="event-qr-card"><strong>${escapeHtml(card.cardCode)}</strong><canvas data-event-qr="${escapeHtml(card.token)}"></canvas><button class="button event-qr-copy-button" type="button" data-copy-qr="${escapeHtml(card.token)}">QR画像をコピー</button></article>`).join("");
    grid.querySelectorAll("canvas[data-event-qr]").forEach((canvas) => {
      const token = canvas.dataset.eventQr;
      window.QRCodeLite?.toCanvas(canvas, `https://yasai-no-haikei.pages.dev/event?token=${encodeURIComponent(token)}`, { scale: 4, margin: 3 });
    });
    grid.querySelectorAll("[data-copy-qr]").forEach((button) => button.addEventListener("click", () => copyQrImage(button.dataset.copyQr, button)));
  }

  async function copyQrImage(token, button) {
    const canvas = $(`canvas[data-event-qr="${token}"]`);
    if (!canvas) return;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") throw new Error("clipboard-unavailable");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (error) {
      const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = `${token}-qr.png`; link.click();
    }
    if (button) { button.disabled = true; window.setTimeout(() => { button.disabled = false; }, 1200); }
  }

  async function uploadEventThumbnailIfSelected() {
    const file = $("[data-event-thumbnail]")?.files?.[0]; if (!file || !eventState) return;
    const form = new FormData(); form.append("eventId", eventState.id); form.append("kind", "thumbnail"); form.append("image", file, file.name);
    const response = await fetch("/api/events/upload", { method: "POST", credentials: "include", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "サムネイルのアップロードに失敗しました。"); eventState.thumbnailUrl = data.url;
  }

  async function uploadCommonVideo() {
    const input = $("[data-common-video]");
    const status = $("[data-common-status]");
    const file = eventCommonComposedFile;
    if (!file || !eventState) { status.textContent = "動画をつないでからアップロードしてください。"; return; }
    status.textContent = "アップロード中…";
    const form = new FormData(); form.append("eventId", eventState.id); form.append("kind", "common"); form.append("video", file, file.name);
    try {
      const response = await fetch("/api/events/upload", { method: "POST", credentials: "include", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "アップロードに失敗しました。");
      eventState.commonVideoUrl = data.url; status.textContent = "共通動画を登録しました。"; status.className = "status is-success";
    } catch (error) { status.textContent = error.message; status.className = "status is-error"; }
  }

  async function setupHandoff() {
    const id = new URLSearchParams(location.search).get("event");
    if (!id) return setHandoffStatus("イベント指定がありません。", true);
    try { const data = await window.YNHAuth.apiJson(`/api/events/${encodeURIComponent(id)}`, { method: "GET" }); eventState = { ...data.event, cards: data.cards }; renderHandoff(); } catch (error) { setHandoffStatus(error.message, true); return; }
    $("[data-camera-start]")?.addEventListener("click", prepareCamera);
    $("[data-record-start]")?.addEventListener("click", startRecording);
    $("[data-record-stop]")?.addEventListener("click", stopRecording);
    $("[data-record-start]").textContent = "録画開始";
    $("[data-record-stop]").textContent = "停止して保存";
    $("[data-handoff-card]")?.addEventListener("change", () => { if (recorder?.state === "recording") return; setHandoffStatus(`カード ${$("[data-handoff-card]").value} を選択中です。`); });
  }

  function renderHandoff() {
    $("[data-handoff-event-name]").textContent = eventState.name;
    const select = $("[data-handoff-card]");
    select.innerHTML = eventState.cards.map((card) => `<option value="${escapeHtml(card.id)}"${card.finalVideoUrl ? " disabled" : ""}>${escapeHtml(card.cardCode)}${card.finalVideoUrl ? "（完了）" : card.handoffVideoUrl ? "（処理済み）" : "（未撮影）"}</option>`).join("");
    eventState.cards.forEach((card, index) => { if (card.handoffVideoUrl || card.finalVideoUrl) select.options[index].disabled = true; });
    const next = eventState.cards.find((card) => !card.handoffVideoUrl && !card.finalVideoUrl);
    if (next) {
      select.value = next.id;
      setHandoffStatus(`${next.cardCode}から撮影を再開できます。`, false);
    } else {
      setHandoffStatus("すべてのカードが撮影済みです。", false);
      $("[data-record-start]").disabled = true;
    }
    renderJobs();
  }

  async function prepareCamera() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: false });
      $("[data-camera-preview]").srcObject = mediaStream;
      $("[data-record-start]").disabled = false;
      setHandoffStatus("カメラの準備ができました。手元だけが映るように確認してください。", false);
    } catch (error) { setHandoffStatus("カメラを利用できませんでした。ブラウザの許可を確認してください。", true); }
  }

  function startRecording() {
    if (!mediaStream || handoffProcessing) return;
    chunks = [];
    const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((item) => MediaRecorder.isTypeSupported(item)) || "";
    recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = processRecording;
    recorder.start(250);
    $("[data-record-start]").disabled = true;
    $("[data-record-stop]").disabled = false;
    setHandoffStatus("録画中です。自然に商品を手渡してください。", false);
  }

  function stopRecording() {
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
    $("[data-record-stop]").disabled = true;
    setHandoffStatus("動画を保存して結合しています。画面を閉じないでください。", false);
  }

  async function processRecording() {
    const cardId = $("[data-handoff-card]").value;
    handoffProcessing = true;
    $("[data-handoff-card]").disabled = true;
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    await savePendingHandoff(eventState.id, cardId, blob);
    const preview = $("[data-handoff-video]"); if (preview) { preview.removeAttribute("src"); preview.load(); } $("[data-handoff-preview]").hidden = true;
    const handoffForm = new FormData(); handoffForm.append("eventId", eventState.id); handoffForm.append("cardId", cardId); handoffForm.append("kind", "handoff"); handoffForm.append("video", blob, "handoff.webm");
    try {
      await uploadEventVideo(handoffForm);
      setHandoffStatus("手渡し動画を保存しました。共通動画と結合しています。", false);
      if (!eventState.commonVideoUrl) throw new Error("共通動画がまだ登録されていません。先にイベント管理画面で登録してください。");
      const finalFile = await window.KisekiEventComposer.compose(eventState.commonVideoUrl, blob, (message) => setHandoffStatus(message, false));
      const finalForm = new FormData(); finalForm.append("eventId", eventState.id); finalForm.append("cardId", cardId); finalForm.append("kind", "final"); finalForm.append("video", finalFile, finalFile.name);
      await uploadEventVideo(finalForm);
      await deletePendingHandoff(eventState.id, cardId);
      setHandoffStatus("完成しました。QRコードから動画を見られます。", false);
      const data = await window.YNHAuth.apiJson(`/api/events/${encodeURIComponent(eventState.id)}`, { method: "GET" }); eventState.cards = data.cards; renderHandoff();
    } catch (error) { setHandoffStatus(error.message || "処理に失敗しました。", true); }
    handoffProcessing = false;
    $("[data-handoff-card]").disabled = false;
    $("[data-record-start]").disabled = false;
  }

  function pendingDb() { return new Promise((resolve, reject) => { const req = indexedDB.open("kiseki-event-pending", 1); req.onupgradeneeded = () => req.result.createObjectStore("videos"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async function savePendingHandoff(eventId, cardId, blob) { try { const db = await pendingDb(); await new Promise((resolve, reject) => { const tx = db.transaction("videos", "readwrite"); tx.objectStore("videos").put(blob, `${eventId}:${cardId}`); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); } catch {} }
  async function deletePendingHandoff(eventId, cardId) { try { const db = await pendingDb(); await new Promise((resolve, reject) => { const tx = db.transaction("videos", "readwrite"); tx.objectStore("videos").delete(`${eventId}:${cardId}`); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); } catch {} }

  // Sales-floor flow: recording only uploads the handoff. Composition is manual.
  async function processRecording() {
    const cardId = $("[data-handoff-card]").value;
    handoffProcessing = true;
    $("[data-handoff-card]").disabled = true;
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    await savePendingHandoff(eventState.id, cardId, blob);
    const form = new FormData(); form.append("eventId", eventState.id); form.append("cardId", cardId); form.append("kind", "handoff"); form.append("video", blob, "handoff.webm");
    try {
      const uploaded = await uploadEventVideo(form);
      const card = eventState.cards.find((item) => item.id === cardId);
      if (card) { card.handoffVideoUrl = uploaded.url; card.status = "ready"; }
      await deletePendingHandoff(eventState.id, cardId);
      renderHandoff();
      const next = eventState.cards.find((item) => !item.handoffVideoUrl && !item.finalVideoUrl);
      if (next) $("[data-handoff-card]").value = next.id;
      setHandoffStatus(`${card?.cardCode || "動画"}を保存しました。次のカードを撮影できます。`, false);
    } catch (error) {
      setHandoffStatus(`${error.message || "アップロードに失敗しました。"} 端末に一時保存しています。`, true);
    } finally {
      handoffProcessing = false;
      $("[data-handoff-card]").disabled = false;
      $("[data-record-start]").disabled = false;
    }
  }

  async function composeCard(cardId) {
    if (!eventState || handoffProcessing) return;
    const card = eventState.cards.find((item) => item.id === cardId);
    if (!card?.handoffVideoUrl || !eventState.commonVideoUrl) return;
    card.composing = true; renderJobs();
    try {
      const response = await fetch(card.handoffVideoUrl); if (!response.ok) throw new Error("個別動画を読み込めませんでした。");
      const handoffBlob = await response.blob();
      const finalFile = await window.KisekiEventComposer.compose(eventState.commonVideoUrl, handoffBlob, (message) => setHandoffStatus(`${card.cardCode}: ${message}`, false));
      const form = new FormData(); form.append("eventId", eventState.id); form.append("cardId", card.id); form.append("kind", "final"); form.append("video", finalFile, finalFile.name);
      const uploaded = await uploadEventVideo(form); card.finalVideoUrl = uploaded.url; card.composing = false; renderJobs();
      setHandoffStatus(`${card.cardCode}の結合が完了しました。`, false);
    } catch (error) { card.composing = false; renderJobs(); setHandoffStatus(`${card.cardCode}の結合に失敗しました。再度「結合」を押してください。`, true); }
  }

  async function resetEventCard(cardId) {
    const card = eventState?.cards?.find((item) => item.id === cardId);
    if (!card || card.composing) return;
    if (!window.confirm(`${card.cardCode}の個別動画と結合済み動画を削除し、未撮影に戻しますか？`)) return;
    try {
      await window.YNHAuth.apiJson("/api/events/card-reset", { method: "POST", body: JSON.stringify({ eventId: eventState.id, cardId }) });
      card.handoffVideoUrl = "";
      card.finalVideoUrl = "";
      card.status = "unused";
      card.composing = false;
      await deletePendingHandoff(eventState.id, cardId);
      renderHandoff();
      setHandoffStatus(`${card.cardCode}を未撮影に戻しました。もう一度録画できます。`, false);
    } catch (error) {
      setHandoffStatus(error.message || "動画を削除できませんでした。", true);
    }
  }

  function renderJobs() {
    const target = $("[data-event-job-list]"); if (!target) return;
    target.innerHTML = eventState.cards.map((card) => `<div class="event-job-row"><strong>${escapeHtml(card.cardCode)}</strong><span>${card.finalVideoUrl ? "結合済み" : card.composing ? "結合中" : card.handoffVideoUrl ? "保存済み" : "未撮影"}</span>${card.handoffVideoUrl && !card.finalVideoUrl ? `<button class="button" type="button" data-event-compose="${escapeHtml(card.id)}"${card.composing ? " disabled" : ""}>結合</button>` : ""}</div>`).join("");
    target.querySelectorAll("[data-event-compose]").forEach((button) => button.addEventListener("click", () => composeCard(button.dataset.eventCompose)));
  }

  async function uploadEventVideo(form) {
    const response = await fetch("/api/events/upload", { method: "POST", credentials: "include", body: form });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "動画のアップロードに失敗しました。"); return data;
  }

  function renderJobs() {
    const target = $("[data-event-job-list]"); if (!target) return;
    target.innerHTML = eventState.cards.map((card) => `<div class="event-job-row"><strong>${escapeHtml(card.cardCode)}</strong><span>${card.finalVideoUrl ? "完成" : card.handoffVideoUrl ? "個別動画保存済み" : "未撮影"}</span></div>`).join("");
  }

  function renderJobs() {
    const target = $("[data-event-job-list]"); if (!target) return;
    target.innerHTML = eventState.cards.map((card) => `<div class="event-job-row"><strong>${escapeHtml(card.cardCode)}</strong><span>${card.handoffVideoUrl ? "個別動画保存済み" : "未撮影"}</span><button class="button" type="button" data-event-compose="${escapeHtml(card.id)}"${!card.handoffVideoUrl || card.composing ? " disabled" : ""}>${card.composing ? "結合中" : card.finalVideoUrl ? "再結合" : "結合"}</button><span class="event-job-completion${card.finalVideoUrl ? " is-complete" : ""}">${card.finalVideoUrl ? "完了" : card.composing ? "処理中" : "未完了"}</span>${card.handoffVideoUrl || card.finalVideoUrl ? `<button class="button danger-button" type="button" data-event-reset="${escapeHtml(card.id)}"${card.composing ? " disabled" : ""}>削除して撮り直す</button>` : ""}</div>`).join("");
    target.querySelectorAll("[data-event-compose]").forEach((button) => button.addEventListener("click", () => composeCard(button.dataset.eventCompose)));
    target.querySelectorAll("[data-event-reset]").forEach((button) => button.addEventListener("click", () => resetEventCard(button.dataset.eventReset)));
  }

  async function setupPublic() {
    const token = new URLSearchParams(location.search).get("token");
    if (!token) return renderPublicError("QRコードの情報がありません。");
    const video = $("[data-event-public-video]");
    const overlay = $("[data-event-public-overlay]");
    const view = $("[data-event-public-view]");
    const start = $("[data-event-public-start]");
    let overlayTimer = 0;
    let overlayShown = false;
    start?.addEventListener("click", () => {
      overlayShown = false;
      window.clearTimeout(overlayTimer);
      overlay?.classList.remove("is-playing");
      start.classList.add("is-starting");
      const playback = video?.play();
      enterEventFullscreen(video, view);
      playback?.catch(() => { start.classList.remove("is-starting"); const label = start.querySelector("strong"); if (label) label.textContent = "もう一度タップして再生"; });
    });
    video?.addEventListener("playing", () => {
      view?.classList.add("is-playing");
      if (!overlayShown && overlay && !overlay.hidden) {
        overlayShown = true;
        overlayTimer = window.setTimeout(() => { overlay.classList.remove("is-playing"); void overlay.offsetWidth; overlay.classList.add("is-playing"); }, 450);
      }
    });
    video?.addEventListener("ended", () => { if (video.dataset.playlistReady && video.dataset.playlistStep !== "second") return; view?.classList.remove("is-playing"); start?.classList.remove("is-starting"); exitEventFullscreen(video); });
    video?.addEventListener("webkitbeginfullscreen", () => setEventNativeOverlayVisible(video, true));
    video?.addEventListener("webkitendfullscreen", () => setEventNativeOverlayVisible(video, false));
    await loadPublicCard(token);
    window.setInterval(() => loadPublicCard(token, true), 5000);
  }

  function enterEventFullscreen(video, view) { try { if (document.fullscreenElement || document.webkitFullscreenElement) return; const target = view || video; if (target?.requestFullscreen) { const request = target.requestFullscreen(); request?.catch?.(() => {}); } else if (target?.webkitRequestFullscreen) target.webkitRequestFullscreen(); else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); } catch {} }
  function exitEventFullscreen(video) { try { if (document.fullscreenElement || document.webkitFullscreenElement) { if (document.exitFullscreen) document.exitFullscreen()?.catch?.(() => {}); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } else if (video?.webkitDisplayingFullscreen && video.webkitExitFullscreen) video.webkitExitFullscreen(); } catch {} }

  function setupEventNativeOverlay(video, text) {
    if (!video?.addTextTrack || !window.VTTCue) return;
    const value = String(text || "").trim();
    if (video.dataset.eventNativeOverlay === value) return;
    video.dataset.eventNativeOverlay = value;
    const track = video.__eventOverlayTrack || video.addTextTrack("captions", "軌跡", "ja");
    video.__eventOverlayTrack = track;
    Array.from(track.cues || []).forEach((cue) => track.removeCue(cue));
    track.mode = "hidden";
    if (!value) return;
    const safe = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    [[0.55, 1.35, "kiseki-fade-soft"], [1.35, 2.15, "kiseki-fade-medium"], [2.15, 4.8, "kiseki-fade-full"], [4.8, 5.6, "kiseki-fade-medium"], [5.6, 6.4, "kiseki-fade-soft"]].forEach(([start, end, className]) => {
      const cue = new VTTCue(start, end, `<c.${className}>${safe}</c>`);
      cue.snapToLines = false; cue.line = 18; cue.position = 50; cue.size = 88; cue.align = "center";
      track.addCue(cue);
    });
  }

  function setEventNativeOverlayVisible(video, visible) {
    if (video?.__eventOverlayTrack) video.__eventOverlayTrack.mode = visible ? "showing" : "hidden";
  }

  async function loadPublicCard(token, quiet = false) {
    try {
      const response = await fetch(`/api/event-card/${encodeURIComponent(token)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "読み込めませんでした。");
      const card = data.card; $("[data-event-public-title]").textContent = card.title || "あなたに届くまで"; $("[data-event-public-note]").textContent = `${card.eventName} / ${card.cardCode}`; const overlay = $("[data-event-public-overlay]"); overlay.textContent = card.overlayText || ""; overlay.hidden = !card.overlayText;
      if (overlay && card.overlayText) overlay.innerHTML = Array.from(card.overlayText).map((char, index) => `<span class="event-overlay-char" style="--char-index:${index}">${escapeHtml(char)}</span>`).join("");
      const video = $("[data-event-public-video]");
      setupEventNativeOverlay(video, card.overlayText);
      if (card.thumbnailUrl) video.poster = card.thumbnailUrl;
      if (card.finalVideoUrl) { if (video.dataset.currentUrl !== card.finalVideoUrl) { video.src = card.finalVideoUrl; video.dataset.currentUrl = card.finalVideoUrl; } $("[data-event-public-status]").textContent = "動画をご覧ください。"; return; }
      if (card.commonVideoUrl && card.handoffVideoUrl) { setupPlaylist(video, card.commonVideoUrl, card.handoffVideoUrl); $("[data-event-public-status]").textContent = "あなたに届くまでの動画を準備しました。"; return; }
      $("[data-event-public-status]").textContent = quiet ? "動画を準備しています…" : "手渡し動画を準備しています…";
      if (card.commonVideoUrl && video.dataset.currentUrl !== card.commonVideoUrl) { video.src = card.commonVideoUrl; video.dataset.currentUrl = card.commonVideoUrl; }
    } catch (error) { if (!quiet) renderPublicError(error.message); }
  }

  function setupPlaylist(video, first, second) {
    if (video.dataset.playlistReady === `${first}|${second}`) return;
    video.dataset.playlistReady = `${first}|${second}`; video.src = first; video.dataset.currentUrl = first; video.onended = () => { if (video.dataset.playlistStep === "second") return; video.dataset.playlistStep = "second"; video.src = second; video.play().catch(() => {}); };
  }

  function renderPublicError(message) { $("[data-event-public-status]").textContent = message; }
  function setHandoffStatus(message, error) { const el = $("[data-handoff-status]"); if (!el) return; el.textContent = message; el.className = `status${error ? " is-error" : ""}`; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
})();
