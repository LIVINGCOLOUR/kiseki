(() => {
  "use strict";

  const LIMITS = {
    minClips: 2,
    maxClips: 5,
    recommendedMinSeconds: 6,
    recommendedMaxSeconds: 10,
    longClipWarningSeconds: 25,
    largeFileWarningBytes: 80 * 1024 * 1024,
    totalWarningBytes: 250 * 1024 * 1024,
    targetMaxSeconds: 30,
    trimEdgeSeconds: 0.5,
    crossfadeSeconds: 0.5,
    audioFadeSeconds: 0.08,
    outputWidth: 720,
    outputHeight: 1280,
    fps: 30,
    outputVideoBitrate: "1800k",
    outputAudioBitrate: "96k",
  };

  const FFMPEG_SCRIPT = "vendor/ffmpeg/ffmpeg.min.js";
  const FFMPEG_CORE = "vendor/ffmpeg/ffmpeg-core.js";
  const FFMPEG_WASM = "vendor/ffmpeg/ffmpeg-core.wasm";
  const FFMPEG_WORKER = "vendor/ffmpeg/ffmpeg-core.worker.js";
  const VIDEO_FILTER =
    "scale=720:1280:force_original_aspect_ratio=decrease," +
    "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black," +
    "fps=30,format=yuv420p,setsar=1,settb=AVTB,setpts=PTS-STARTPTS";
  const AUDIO_FILTER = "aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0";

  const state = {
    clips: [],
    ffmpeg: null,
    ffmpegLoaded: false,
    running: false,
    cancelled: false,
    phaseBase: 0,
    phaseSpan: 1,
    startedAt: 0,
    elapsedTimer: 0,
    fsFiles: new Set(),
    result: null,
    fallback: null,
    metrics: {},
    ffmpegMessages: [],
    normalizedFiles: new Map(),
  };

  document.addEventListener("DOMContentLoaded", setupHarvestVideoComposer);

  function setupHarvestVideoComposer() {
    const root = document.querySelector("[data-harvest-composer]");
    if (!root) return;

    const ui = {
      root,
      input: root.querySelector("[data-composer-input]"),
      summary: root.querySelector("[data-composer-summary]"),
      warnings: root.querySelector("[data-composer-warnings]"),
      list: root.querySelector("[data-composer-list]"),
      generate: root.querySelector("[data-composer-generate]"),
      reset: root.querySelector("[data-composer-reset]"),
      progress: root.querySelector("[data-composer-progress]"),
      phase: root.querySelector("[data-composer-phase]"),
      progressBar: root.querySelector("[data-composer-progress-bar]"),
      progressPercent: root.querySelector("[data-composer-progress-percent]"),
      elapsed: root.querySelector("[data-composer-elapsed]"),
      cancel: root.querySelector("[data-composer-cancel]"),
      result: root.querySelector("[data-composer-result]"),
      resultVideo: root.querySelector("[data-composer-result-video]"),
      resultMeta: root.querySelector("[data-composer-result-meta]"),
      useResult: root.querySelector("[data-composer-use]"),
      remake: root.querySelector("[data-composer-remake]"),
      download: root.querySelector("[data-composer-download]"),
      fallbackInput: root.querySelector("[data-composer-fallback-input]"),
      fallbackPreview: root.querySelector("[data-composer-fallback-preview]"),
      useFallback: root.querySelector("[data-composer-use-fallback]"),
      log: root.querySelector("[data-composer-log]"),
    };

    ui.input?.addEventListener("change", () => selectClips(ui, Array.from(ui.input.files || [])));
    ui.list?.addEventListener("click", (event) => handleListAction(ui, event));
    ui.generate?.addEventListener("click", () => generateComposedVideo(ui));
    ui.reset?.addEventListener("click", () => resetComposer(ui));
    ui.cancel?.addEventListener("click", () => cancelComposer(ui));
    ui.remake?.addEventListener("click", () => resetResult(ui));
    ui.useResult?.addEventListener("click", () => useResultVideo(ui));
    ui.fallbackInput?.addEventListener("change", () => selectFallbackVideo(ui));
    ui.useFallback?.addEventListener("click", () => useFallbackVideo(ui));

    renderComposer(ui);
    updateLog(ui, { status: "idle", userAgent: navigator.userAgent });
  }

  async function selectClips(ui, files) {
    cleanupClipUrls();
    resetResult(ui);
    state.clips = [];
    const usable = files.filter((file) => file && file.type.startsWith("video/")).slice(0, LIMITS.maxClips);
    for (const file of usable) {
      try {
        const meta = await readVideoMetadata(file);
        state.clips.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file,
          url: meta.url,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          hasAudio: meta.hasAudio,
        });
      } catch (error) {
        console.error("動画メタデータの読み込みに失敗しました。", error);
        showComposerError(ui, "ファイル読み込み失敗", "読み込めない動画がありました。対応している動画ファイルを選び直してください。");
      }
    }
    if (files.length > LIMITS.maxClips) {
      showComposerWarning(ui, [`動画は最大${LIMITS.maxClips}本までです。先頭${LIMITS.maxClips}本だけ読み込みました。`]);
    }
    renderComposer(ui);
  }

  function readVideoMetadata(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      let settled = false;
      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };
      const finish = (meta) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(meta);
        cleanup();
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        URL.revokeObjectURL(url);
        reject(error);
      };
      const timer = window.setTimeout(() => {
        fail(new Error("metadata timeout"));
      }, 10000);
      video.onloadedmetadata = async () => {
        const meta = {
          url,
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          hasAudio: null,
        };
        try {
          meta.hasAudio = await detectVideoAudio(video, meta.duration);
        } catch (error) {
          console.warn("動画の音声有無を確認できませんでした。", error);
        }
        finish(meta);
      };
      video.onerror = () => {
        fail(new Error("metadata error"));
      };
      video.src = url;
    });
  }

  async function detectVideoAudio(video, duration) {
    if (video.audioTracks && typeof video.audioTracks.length === "number" && video.audioTracks.length > 0) {
      return true;
    }
    if (typeof video.mozHasAudio === "boolean") return video.mozHasAudio;
    const initialDecoded = typeof video.webkitAudioDecodedByteCount === "number" ? video.webkitAudioDecodedByteCount : null;
    if (typeof video.play !== "function") return null;
    try {
      if (Number.isFinite(duration) && duration > 0.5) {
        video.currentTime = Math.min(0.2, Math.max(0, duration / 4));
      }
    } catch (error) {
      // Some browser/file combinations do not allow seeking before play.
    }
    try {
      await video.play();
      await wait(450);
      video.pause();
    } catch (error) {
      return null;
    }
    if (typeof video.webkitAudioDecodedByteCount === "number") {
      return video.webkitAudioDecodedByteCount > (initialDecoded || 0);
    }
    return null;
  }

  function inspectGeneratedVideo(url) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      const done = (value) => {
        video.removeAttribute("src");
        video.load();
        resolve(value);
      };
      const timer = window.setTimeout(() => {
        done({ video: "unknown", audio: "unknown", reason: "timeout" });
      }, 5000);
      video.onloadedmetadata = async () => {
        window.clearTimeout(timer);
        let hasAudio = null;
        try {
          hasAudio = await detectVideoAudio(video, video.duration);
        } catch (error) {
          hasAudio = null;
        }
        done({
          video: video.videoWidth > 0 && video.videoHeight > 0 ? "yes" : "unknown",
          audio: audioDetectionLabel(hasAudio),
          duration: Number.isFinite(video.duration) ? video.duration : null,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        });
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        done({ video: "unknown", audio: "unknown", reason: "metadata-error" });
      };
      video.src = url;
    });
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function renderComposer(ui) {
    renderSummary(ui);
    renderWarnings(ui);
    renderClipList(ui);
    if (ui.generate) ui.generate.disabled = !isReadyToGenerate();
  }

  function renderSummary(ui) {
    const count = state.clips.length;
    const totalBytes = getTotalBytes();
    const totalDuration = getTotalDuration();
    if (!count) {
      ui.summary.textContent = "素材動画はまだ選択されていません。";
      return;
    }
    ui.summary.textContent =
      `${count}本 / 合計 ${formatSeconds(totalDuration)} / ${formatFileSizeForComposer(totalBytes)}`;
  }

  function renderWarnings(ui) {
    const warnings = getWarnings();
    if (!warnings.length) {
      ui.warnings.hidden = true;
      ui.warnings.innerHTML = "";
      return;
    }
    showComposerWarning(ui, warnings);
  }

  function showComposerWarning(ui, warnings) {
    if (!ui.warnings) return;
    ui.warnings.hidden = false;
    ui.warnings.innerHTML = `<ul>${warnings.map((warning) => `<li>${escapeHtmlLocal(warning)}</li>`).join("")}</ul>`;
  }

  function renderClipList(ui) {
    if (!ui.list) return;
    if (!state.clips.length) {
      ui.list.innerHTML = "";
      return;
    }
    ui.list.innerHTML = state.clips
      .map((clip, index) => {
        const resolution = clip.width && clip.height ? `${clip.width}×${clip.height}` : "解像度未取得";
        const audioLabel = clip.hasAudio === true ? "音声あり" : clip.hasAudio === false ? "音声なし" : "音声未確認";
        return `
          <article class="harvest-composer-item" data-clip-id="${escapeAttributeLocal(clip.id)}">
            <video src="${escapeAttributeLocal(clip.url)}" muted playsinline preload="metadata"></video>
            <div class="harvest-composer-item-body">
              <strong>${index + 1}. ${escapeHtmlLocal(clip.file.name)}</strong>
              <span>${formatSeconds(clip.duration)} / ${formatFileSizeForComposer(clip.file.size)} / ${resolution} / ${audioLabel}</span>
              <div class="harvest-composer-item-actions">
                <button type="button" data-clip-action="up" ${index === 0 ? "disabled" : ""}>上へ</button>
                <button type="button" data-clip-action="down" ${index === state.clips.length - 1 ? "disabled" : ""}>下へ</button>
                <button type="button" data-clip-action="remove">削除</button>
              </div>
            </div>
          </article>`;
      })
      .join("");
  }

  function handleListAction(ui, event) {
    const button = event.target.closest("[data-clip-action]");
    if (!button) return;
    const item = event.target.closest("[data-clip-id]");
    const index = state.clips.findIndex((clip) => clip.id === item?.dataset.clipId);
    if (index < 0) return;
    const action = button.dataset.clipAction;
    if (action === "up" && index > 0) {
      [state.clips[index - 1], state.clips[index]] = [state.clips[index], state.clips[index - 1]];
    } else if (action === "down" && index < state.clips.length - 1) {
      [state.clips[index + 1], state.clips[index]] = [state.clips[index], state.clips[index + 1]];
    } else if (action === "remove") {
      const [removed] = state.clips.splice(index, 1);
      if (removed?.url) URL.revokeObjectURL(removed.url);
    }
    renderComposer(ui);
  }

  function isReadyToGenerate() {
    return state.clips.length >= LIMITS.minClips && state.clips.length <= LIMITS.maxClips && !state.running;
  }

  function getWarnings() {
    const warnings = [];
    if (state.clips.length && state.clips.length < LIMITS.minClips) {
      warnings.push(`動画は最低${LIMITS.minClips}本必要です。`);
    }
    if (state.clips.length > LIMITS.maxClips) {
      warnings.push(`動画は最大${LIMITS.maxClips}本までです。`);
    }
    state.clips.forEach((clip, index) => {
      if (!clip.file.type.startsWith("video/")) warnings.push(`${index + 1}本目は対応していないファイル形式です。`);
      if (clip.duration > LIMITS.longClipWarningSeconds) warnings.push(`${index + 1}本目が長めです。短い動画の方がスマホで処理しやすいです。`);
      if (clip.file.size > LIMITS.largeFileWarningBytes) warnings.push(`${index + 1}本目の容量が大きめです。処理に時間がかかる可能性があります。`);
      if (clip.width >= 3840 || clip.height >= 2160) warnings.push(`${index + 1}本目は4K相当です。スマホでは処理に時間がかかる可能性があります。`);
    });
    if (getTotalBytes() > LIMITS.totalWarningBytes) {
      warnings.push("合計容量が大きめです。メモリ不足になる場合は本数や長さを減らしてください。");
    }
    return warnings;
  }

  async function generateComposedVideo(ui) {
    if (!isReadyToGenerate()) {
      showComposerError(ui, "入力条件エラー", `動画を${LIMITS.minClips}〜${LIMITS.maxClips}本選んでください。`);
      return;
    }
    state.running = true;
    state.cancelled = false;
    state.startedAt = performance.now();
    state.metrics = {
      userAgent: navigator.userAgent,
      inputCount: state.clips.length,
      inputTotalBytes: getTotalBytes(),
      inputTotalSeconds: getTotalDuration(),
      success: false,
      audioInputs: state.clips.map((clip, index) => ({
        index: index + 1,
        fileName: clip.file.name,
        browserAudioDetection: audioDetectionLabel(clip.hasAudio),
        mode: "pending",
      })),
    };
    state.ffmpegMessages = [];
    state.normalizedFiles.clear();
    resetResult(ui);
    startElapsedTimer(ui);
    setControlsDisabled(ui, true);
    showProgress(ui, "動画処理の準備中", 2);

    try {
      await ensureFfmpeg(ui);
      await cleanupFfmpegFs();
      const plan = createCompositionPlan(state.clips);
      state.metrics.plan = plan.map((item) => ({ start: item.start, duration: item.duration }));
      showProgress(ui, "動画を変換中", 5);

      for (let i = 0; i < state.clips.length; i += 1) {
        if (state.cancelled) throw createComposerError("cancelled", "ユーザーによるキャンセル");
        await normalizeClip(ui, state.clips[i], plan[i], i);
        persistFsFile(`clip-${i}.mp4`);
      }

      if (state.cancelled) throw createComposerError("cancelled", "ユーザーによるキャンセル");
      showProgress(ui, "動画を結合中", 72);
      await combineClips(ui, plan.map((item) => item.duration));

      showProgress(ui, "完成動画を準備中", 94);
      const data = state.ffmpeg.FS("readFile", "output.mp4");
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const file = new File([blob], `harvest-composed-${Date.now()}.mp4`, { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      state.result = { blob, file, url, seconds: getComposedDuration(plan.map((item) => item.duration)) };
      state.metrics.outputMedia = await inspectGeneratedVideo(url);
      state.metrics.success = true;
      state.metrics.outputSeconds = state.result.seconds;
      state.metrics.outputBytes = blob.size;
      state.metrics.elapsedMs = Math.round(performance.now() - state.startedAt);
      state.metrics.ffmpegTail = state.ffmpegMessages.slice(-12);
      renderResult(ui);
      showProgress(ui, "完成しました", 100);
      console.info("Harvest video compose PoC", state.metrics);
      updateLog(ui, state.metrics);
    } catch (error) {
      handleComposerError(ui, error);
    } finally {
      state.running = false;
      stopElapsedTimer();
      setControlsDisabled(ui, false);
      if (ui.generate) ui.generate.disabled = !isReadyToGenerate();
    }
  }

  async function ensureFfmpeg(ui) {
    if (!window.FFmpeg) {
      showProgress(ui, "ffmpeg.wasmを読み込み中", 3);
      await loadScript(FFMPEG_SCRIPT);
    }
    if (!window.FFmpeg) throw createComposerError("ffmpeg-load", "ffmpeg.wasmを読み込めませんでした。");
    if (!state.ffmpeg) {
      const { createFFmpeg } = window.FFmpeg;
      state.ffmpeg = createFFmpeg({
        corePath: assetUrl(FFMPEG_CORE),
        wasmPath: assetUrl(FFMPEG_WASM),
        workerPath: assetUrl(FFMPEG_WORKER),
        mainName: "main",
        log: false,
        progress: ({ ratio }) => {
          if (!Number.isFinite(ratio)) return;
          const value = Math.min(99, state.phaseBase + Math.max(0, ratio) * state.phaseSpan);
          updateProgressValue(ui, value);
        },
      });
      state.ffmpeg.setLogger(({ type, message }) => {
        state.ffmpegMessages.push({ type, message });
        if (state.ffmpegMessages.length > 80) state.ffmpegMessages.shift();
      });
    }
    if (!state.ffmpegLoaded) {
      try {
        await state.ffmpeg.load();
        state.ffmpegLoaded = true;
      } catch (error) {
        console.error("ffmpeg.wasm load failed", error);
        throw createComposerError("ffmpeg-load", "ffmpeg.wasmの読み込みに失敗しました。");
      }
    }
  }

  function assetUrl(path) {
    return new URL(path, window.location.href).href;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        if (window.FFmpeg) resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function createCompositionPlan(clips) {
    const usable = clips.map((clip) => {
      const trim = clip.duration > LIMITS.trimEdgeSeconds * 2 + 1 ? LIMITS.trimEdgeSeconds : 0;
      return {
        start: trim,
        maxDuration: Math.max(0.5, clip.duration - trim * 2),
      };
    });
    const usableSum = usable.reduce((sum, item) => sum + item.maxDuration, 0);
    const targetInputSum = LIMITS.targetMaxSeconds + LIMITS.crossfadeSeconds * Math.max(0, clips.length - 1);
    const scale = usableSum > targetInputSum ? targetInputSum / usableSum : 1;
    return usable.map((item) => ({
      start: item.start,
      duration: Math.max(0.5, Math.min(item.maxDuration, item.maxDuration * scale)),
    }));
  }

  async function normalizeClip(ui, clip, plan, index) {
    const ext = getVideoExtension(clip.file);
    const inputName = `input-${index}.${ext}`;
    const outputName = `clip-${index}.mp4`;
    state.ffmpeg.FS("writeFile", inputName, await window.FFmpeg.fetchFile(clip.file));
    state.fsFiles.add(inputName);
    state.fsFiles.add(outputName);
    state.phaseBase = 5 + index * (64 / state.clips.length);
    state.phaseSpan = 60 / state.clips.length;
    const audioMetric = state.metrics.audioInputs?.[index];
    if (audioMetric) {
      audioMetric.input = inputName;
      audioMetric.normalized = outputName;
      audioMetric.trimStart = plan.start;
      audioMetric.duration = plan.duration;
      audioMetric.audioFilter = buildAudioNormalizeFilter(plan.duration);
      audioMetric.mode = "try-source-audio";
    }
    showProgress(ui, `動画を変換中（${index + 1}/${state.clips.length}）`, state.phaseBase);
    if (clip.hasAudio === false) {
      state.metrics.audioFallback = true;
      if (audioMetric) {
        audioMetric.mode = "silent-browser-no-audio";
        audioMetric.silentAudioArgs = buildNormalizeSilentAudioArgs(inputName, outputName, plan);
      }
      await runNormalizeWithSilentAudioSafe(inputName, outputName, plan);
      return;
    }
    try {
      if (audioMetric) audioMetric.sourceAudioArgs = buildNormalizeSourceAudioArgs(inputName, outputName, plan);
      await runNormalizeWithSourceAudioSafe(inputName, outputName, plan);
      if (audioMetric) audioMetric.mode = "source-audio";
    } catch (error) {
      console.warn("音声付き変換に失敗したため、無音トラックを補って続行します。", error);
      state.metrics.audioFallback = true;
      if (audioMetric) {
        audioMetric.mode = "silent-fallback";
        audioMetric.sourceAudioError = summarizeError(error);
        audioMetric.silentAudioArgs = buildNormalizeSilentAudioArgs(inputName, outputName, plan);
      }
      await restartFfmpegAndRestore();
      state.ffmpeg.FS("writeFile", inputName, await window.FFmpeg.fetchFile(clip.file));
      state.fsFiles.add(inputName);
      await runNormalizeWithSilentAudioSafe(inputName, outputName, plan);
      return;
    }
  }

  async function runNormalizeWithSourceAudio(inputName, outputName, plan) {
    await state.ffmpeg.run(
      ...buildNormalizeSourceAudioArgs(inputName, outputName, plan)
    );
  }

  function buildNormalizeSourceAudioArgs(inputName, outputName, plan) {
    return [
      "-ss", String(plan.start),
      "-i", inputName,
      "-t", String(plan.duration),
      "-map", "0:v:0",
      "-map", "0:a:0",
      "-vf", VIDEO_FILTER,
      "-af", buildAudioNormalizeFilter(plan.duration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", LIMITS.outputVideoBitrate,
      "-maxrate", LIMITS.outputVideoBitrate,
      "-bufsize", "3600k",
      "-r", String(LIMITS.fps),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", LIMITS.outputAudioBitrate,
      "-shortest",
      outputName
    ];
  }

  async function runNormalizeWithSourceAudioSafe(inputName, outputName, plan) {
    try {
      await runNormalizeWithSourceAudio(inputName, outputName, plan);
    } catch (error) {
      if (isExitZero(error) && fsFileExists(outputName)) {
        persistFsFile(outputName);
        await restartFfmpegAndRestore();
        return;
      }
      throw error;
    }
  }

  async function runNormalizeWithSilentAudio(inputName, outputName, plan) {
    await state.ffmpeg.run(
      ...buildNormalizeSilentAudioArgs(inputName, outputName, plan)
    );
  }

  function buildNormalizeSilentAudioArgs(inputName, outputName, plan) {
    return [
      "-ss", String(plan.start),
      "-i", inputName,
      "-f", "lavfi",
      "-t", String(plan.duration),
      "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t", String(plan.duration),
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-vf", VIDEO_FILTER,
      "-af", buildAudioNormalizeFilter(plan.duration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", LIMITS.outputVideoBitrate,
      "-maxrate", LIMITS.outputVideoBitrate,
      "-bufsize", "3600k",
      "-r", String(LIMITS.fps),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", LIMITS.outputAudioBitrate,
      "-shortest",
      outputName
    ];
  }

  async function runNormalizeWithSilentAudioSafe(inputName, outputName, plan) {
    try {
      await runNormalizeWithSilentAudio(inputName, outputName, plan);
    } catch (error) {
      if (isExitZero(error) && fsFileExists(outputName)) {
        persistFsFile(outputName);
        await restartFfmpegAndRestore();
        return;
      }
      throw error;
    }
  }

  function isExitZero(error) {
    return String(error?.message || error || "").includes("exit(0)");
  }

  function buildAudioNormalizeFilter(duration) {
    const safeDuration = Math.max(0.1, Number(duration) || 0.1).toFixed(3);
    return `atrim=start=0:duration=${safeDuration},asetpts=PTS-STARTPTS,${AUDIO_FILTER}`;
  }

  function audioDetectionLabel(value) {
    if (value === true) return "audio";
    if (value === false) return "no-audio";
    return "unknown";
  }

  function summarizeError(error) {
    return String(error?.message || error || "").slice(0, 180);
  }

  function fsFileExists(name) {
    try {
      const file = state.ffmpeg.FS("readFile", name);
      return !!file && file.length > 0;
    } catch (error) {
      return false;
    }
  }

  function persistFsFile(name) {
    const file = state.ffmpeg.FS("readFile", name);
    state.normalizedFiles.set(name, new Uint8Array(file));
  }

  async function restartFfmpegAndRestore() {
    try {
      state.ffmpeg?.exit();
    } catch (error) {
      // The single-thread core may throw while exiting after a completed command.
    }
    state.ffmpeg = null;
    state.ffmpegLoaded = false;
    state.fsFiles.clear();
    await ensureFfmpeg({ progress: null, phase: null, progressBar: null });
    state.normalizedFiles.forEach((file, name) => {
      state.ffmpeg.FS("writeFile", name, file);
      state.fsFiles.add(name);
    });
  }

  async function combineClips(ui, durations) {
    state.fsFiles.add("output.mp4");
    state.phaseBase = 72;
    state.phaseSpan = 20;
    const inputArgs = [];
    durations.forEach((_, index) => {
      inputArgs.push("-i", `clip-${index}.mp4`);
    });
    const filter = buildCrossfadeFilter(durations);
    state.metrics.finalFilterGraph = filter;
    state.metrics.finalMap = ["[vout]", "[aout]"];
    const finalArgs = [
      ...inputArgs,
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", LIMITS.outputVideoBitrate,
      "-maxrate", LIMITS.outputVideoBitrate,
      "-bufsize", "3600k",
      "-r", String(LIMITS.fps),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", LIMITS.outputAudioBitrate,
      "-shortest",
      "-movflags", "+faststart",
      "output.mp4",
    ];
    state.metrics.finalFfmpegArgs = finalArgs;
    try {
      await state.ffmpeg.run(
        ...finalArgs
      );
    } catch (error) {
      if (isExitZero(error) && fsFileExists("output.mp4")) return;
      console.warn("クロスフェード結合に失敗したため、単純結合に切り替えます。", error);
      state.metrics.crossfadeFallback = true;
      await restartFfmpegAndRestore();
      await combineClipsWithoutCrossfade(durations);
    }
  }

  function buildCrossfadeFilter(durations) {
    const parts = [];
    if (durations.length === 1) {
      parts.push("[0:v]settb=AVTB,setpts=PTS-STARTPTS[vout]");
      parts.push(`[0:a]${buildAudioConcatInputFilter(durations[0])}[aout]`);
      return parts.join(";");
    }

    let lastV = "0:v";
    let compositeDuration = durations[0];
    for (let i = 1; i < durations.length; i += 1) {
      const vOut = i === durations.length - 1 ? "vout" : `v${i}`;
      const offset = Math.max(0.1, compositeDuration - LIMITS.crossfadeSeconds);
      parts.push(`[${lastV}][${i}:v]xfade=transition=fade:duration=${LIMITS.crossfadeSeconds}:offset=${offset.toFixed(3)}[${vOut}]`);
      compositeDuration = compositeDuration + durations[i] - LIMITS.crossfadeSeconds;
      lastV = vOut;
    }

    durations.forEach((duration, index) => {
      parts.push(`[${index}:a]${buildAudioConcatInputFilter(duration)}[a${index}]`);
    });
    const audioInputs = durations.map((_, index) => `[a${index}]`).join("");
    parts.push(`${audioInputs}concat=n=${durations.length}:v=0:a=1,atrim=start=0:duration=${getComposedDuration(durations).toFixed(3)},asetpts=PTS-STARTPTS[aout]`);
    return parts.join(";");
  }

  function buildAudioConcatInputFilter(duration) {
    const safeDuration = Math.max(0.1, Number(duration) || 0.1);
    const fade = Math.min(LIMITS.audioFadeSeconds, Math.max(0.01, safeDuration / 4));
    const fadeOutStart = Math.max(0, safeDuration - fade);
    return [
      `atrim=start=0:duration=${safeDuration.toFixed(3)}`,
      "asetpts=PTS-STARTPTS",
      "aresample=48000",
      "aformat=sample_rates=48000:channel_layouts=stereo",
      `afade=t=in:st=0:d=${fade.toFixed(3)}`,
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fade.toFixed(3)}`,
    ].join(",");
  }

  function getComposedDuration(durations) {
    if (!durations.length) return 0;
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    return Math.max(0.1, total - LIMITS.crossfadeSeconds * Math.max(0, durations.length - 1));
  }

  async function combineClipsWithoutCrossfade(durations) {
    const list = durations.map((_, index) => `file 'clip-${index}.mp4'`).join("\n");
    state.ffmpeg.FS("writeFile", "concat.txt", new TextEncoder().encode(list));
    state.fsFiles.add("concat.txt");
    try {
      await state.ffmpeg.run(
        "-f", "concat",
        "-safe", "0",
        "-i", "concat.txt",
        "-c", "copy",
        "-movflags", "+faststart",
        "output.mp4"
      );
    } catch (error) {
      if (isExitZero(error) && fsFileExists("output.mp4")) return;
      throw error;
    }
  }

  function renderResult(ui) {
    if (!state.result) return;
    ui.result.hidden = false;
    ui.resultVideo.src = state.result.url;
    ui.download.href = state.result.url;
    ui.download.download = state.result.file.name;
    ui.resultMeta.innerHTML = `
      <div><dt>動画時間</dt><dd>${formatSeconds(state.result.seconds)}</dd></div>
      <div><dt>ファイル容量</dt><dd>${formatFileSizeForComposer(state.result.blob.size)}</dd></div>
      <div><dt>解像度</dt><dd>${LIMITS.outputWidth}×${LIMITS.outputHeight}</dd></div>
    `;
  }

  function useResultVideo(ui) {
    if (!state.result?.file) return;
    dispatchComposedVideo(state.result.file);
    showComposerMessage(ui, "完成動画を下の収穫動画としてセットしました。");
  }

  function selectFallbackVideo(ui) {
    const file = ui.fallbackInput?.files?.[0] || null;
    cleanupFallback();
    state.fallback = null;
    if (!file) {
      renderFallbackPreview(ui, null);
      if (ui.useFallback) ui.useFallback.disabled = true;
      return;
    }
    const url = URL.createObjectURL(file);
    state.fallback = { file, url };
    renderFallbackPreview(ui, state.fallback);
    if (ui.useFallback) ui.useFallback.disabled = false;
  }

  function renderFallbackPreview(ui, fallback) {
    if (!ui.fallbackPreview) return;
    if (!fallback) {
      ui.fallbackPreview.innerHTML = '<p class="harvest-empty-preview">編集済みMP4を選ぶと、ここにプレビューが表示されます。</p>';
      return;
    }
    ui.fallbackPreview.innerHTML = `
      <video class="harvest-admin-preview-video" src="${escapeAttributeLocal(fallback.url)}" controls muted playsinline></video>
      <p>${escapeHtmlLocal(fallback.file.name)} / ${formatFileSizeForComposer(fallback.file.size)}</p>
    `;
  }

  function useFallbackVideo(ui) {
    if (!state.fallback?.file) return;
    dispatchComposedVideo(state.fallback.file);
    showComposerMessage(ui, "編集済みMP4を下の収穫動画としてセットしました。");
  }

  function dispatchComposedVideo(file) {
    document.dispatchEvent(new CustomEvent("harvest-composed-video-ready", { detail: { file } }));
  }

  async function cancelComposer(ui) {
    if (!state.running) return;
    state.cancelled = true;
    showProgress(ui, "キャンセルしています", 0);
    try {
      if (state.ffmpeg) {
        state.ffmpeg.exit();
        state.ffmpeg = null;
        state.ffmpegLoaded = false;
      }
    } catch (error) {
      console.warn("ffmpeg cancel failed", error);
    }
    await cleanupFfmpegFs();
    state.normalizedFiles.clear();
    state.running = false;
    stopElapsedTimer();
    setControlsDisabled(ui, false);
    showComposerError(ui, "ユーザーによるキャンセル", "動画生成をキャンセルしました。");
  }

  function resetComposer(ui) {
    if (state.running) return;
    cleanupClipUrls();
    cleanupFallback();
    resetResult(ui);
    state.normalizedFiles.clear();
    state.clips = [];
    if (ui.input) ui.input.value = "";
    if (ui.fallbackInput) ui.fallbackInput.value = "";
    renderFallbackPreview(ui, null);
    if (ui.useFallback) ui.useFallback.disabled = true;
    renderComposer(ui);
    updateLog(ui, { status: "idle", userAgent: navigator.userAgent });
  }

  function resetResult(ui) {
    if (state.result?.url) URL.revokeObjectURL(state.result.url);
    state.result = null;
    state.normalizedFiles.clear();
    void cleanupFfmpegFs();
    if (ui.result) ui.result.hidden = true;
    if (ui.resultVideo) {
      ui.resultVideo.removeAttribute("src");
      ui.resultVideo.load();
    }
    if (ui.download) ui.download.removeAttribute("href");
  }

  async function cleanupFfmpegFs() {
    if (!state.ffmpeg) {
      state.fsFiles.clear();
      return;
    }
    Array.from(state.fsFiles).forEach((name) => tryUnlink(name));
    state.fsFiles.clear();
  }

  function tryUnlink(name) {
    try {
      state.ffmpeg?.FS("unlink", name);
    } catch (error) {
      // 既に無い一時ファイルは無視する。
    }
  }

  function cleanupClipUrls() {
    state.clips.forEach((clip) => {
      if (clip.url) URL.revokeObjectURL(clip.url);
    });
  }

  function cleanupFallback() {
    if (state.fallback?.url) URL.revokeObjectURL(state.fallback.url);
    state.fallback = null;
  }

  function handleComposerError(ui, error) {
    const type = state.cancelled ? "cancelled" : error?.composerType || classifyError(error);
    state.metrics.success = false;
    state.metrics.errorType = type;
    state.metrics.elapsedMs = Math.round(performance.now() - state.startedAt);
    state.metrics.ffmpegTail = state.ffmpegMessages.slice(-12);
    console.error("Harvest video compose failed", JSON.stringify({
      type,
      message: error?.message || String(error),
      metrics: state.metrics,
      ffmpegTail: state.metrics.ffmpegTail,
    }));
    updateLog(ui, state.metrics);
    const titleMap = {
      cancelled: "ユーザーによるキャンセル",
      "ffmpeg-load": "ffmpeg読み込み失敗",
      memory: "メモリ不足の可能性",
      audio: "音声処理失敗",
      unsupported: "対応していない動画",
      convert: "動画変換失敗",
    };
    showComposerError(ui, titleMap[type] || "動画変換失敗", "動画の本数や長さを減らして再度お試しください。うまくいかない場合は、編集済みのMP4を直接登録できます。");
  }

  function classifyError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    if (message.includes("cancel")) return "cancelled";
    if (message.includes("memory") || message.includes("out of bounds") || message.includes("allocation")) return "memory";
    if (message.includes("audio") || message.includes("stream specifier")) return "audio";
    if (message.includes("invalid data") || message.includes("moov atom")) return "unsupported";
    return "convert";
  }

  function createComposerError(type, message) {
    const error = new Error(message);
    error.composerType = type;
    return error;
  }

  function showComposerError(ui, title, message) {
    showComposerWarning(ui, [`${title}：${message}`]);
  }

  function showComposerMessage(ui, message) {
    showComposerWarning(ui, [message]);
  }

  function showProgress(ui, phase, value) {
    if (ui.progress) ui.progress.hidden = false;
    if (ui.phase) ui.phase.textContent = phase;
    updateProgressValue(ui, value);
  }

  function updateProgressValue(ui, value) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    if (ui.progressBar) ui.progressBar.value = safeValue;
    if (ui.progressPercent) ui.progressPercent.textContent = `${safeValue}%`;
  }

  function startElapsedTimer(ui) {
    stopElapsedTimer();
    state.elapsedTimer = window.setInterval(() => {
      if (!ui.elapsed || !state.startedAt) return;
      ui.elapsed.textContent = `${Math.round((performance.now() - state.startedAt) / 1000)}秒`;
    }, 500);
  }

  function stopElapsedTimer() {
    if (state.elapsedTimer) window.clearInterval(state.elapsedTimer);
    state.elapsedTimer = 0;
  }

  function setControlsDisabled(ui, disabled) {
    [ui.input, ui.generate, ui.reset, ui.fallbackInput, ui.useFallback].forEach((control) => {
      if (control) control.disabled = disabled;
    });
    if (ui.cancel) ui.cancel.disabled = !disabled;
  }

  function getTotalBytes() {
    return state.clips.reduce((sum, clip) => sum + clip.file.size, 0);
  }

  function getTotalDuration() {
    return state.clips.reduce((sum, clip) => sum + (clip.duration || 0), 0);
  }

  function getVideoExtension(file) {
    const match = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    if (match) return match[1].replace("jpeg", "jpg");
    if (/quicktime/i.test(file.type)) return "mov";
    if (/webm/i.test(file.type)) return "webm";
    return "mp4";
  }

  function formatSeconds(value) {
    if (!Number.isFinite(value)) return "時間未取得";
    return `${Math.round(value * 10) / 10}秒`;
  }

  function formatFileSizeForComposer(size) {
    if (!Number.isFinite(size)) return "";
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }

  function updateLog(ui, data) {
    if (ui.log) ui.log.textContent = JSON.stringify(data, null, 2);
  }

  function escapeHtmlLocal(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttributeLocal(value) {
    return escapeHtmlLocal(value).replace(/`/g, "&#096;");
  }
})();
