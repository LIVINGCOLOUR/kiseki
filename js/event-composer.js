(() => {
  "use strict";

  const SCRIPT = "vendor/ffmpeg/ffmpeg.min.js";
  const CORE = "vendor/ffmpeg/ffmpeg-core.js";
  const WASM = "vendor/ffmpeg/ffmpeg-core.wasm";
  const WORKER = "vendor/ffmpeg/ffmpeg-core.worker.js";
  let scriptPromise;
  let composeQueue = Promise.resolve();

  function assetUrl(path) {
    return new URL(path, window.location.href).href;
  }

  function loadScript() {
    if (window.FFmpeg) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = assetUrl(SCRIPT);
      script.onload = resolve;
      script.onerror = () => reject(new Error("動画結合機能を読み込めませんでした。"));
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  async function createInstance() {
    await loadScript();
    const { createFFmpeg } = window.FFmpeg;
    const instance = createFFmpeg({
      corePath: assetUrl(CORE),
      wasmPath: assetUrl(WASM),
      workerPath: assetUrl(WORKER),
      mainName: "main",
      log: false,
    });
    await instance.load();
    return instance;
  }

  async function runCompose(commonUrl, handoffBlob, onProgress) {
    const ff = await createInstance();
    const { fetchFile } = window.FFmpeg;
    try {
      onProgress?.("共通動画を読み込み中");
      const response = await fetch(new URL(commonUrl, window.location.href).href, { credentials: "include" });
      if (!response.ok) throw new Error(`共通動画を読み込めませんでした（HTTP ${response.status}）。`);
      ff.FS("writeFile", "common.mp4", await fetchFile(await response.blob()));
      ff.FS("writeFile", "handoff.webm", await fetchFile(handoffBlob));
      onProgress?.("共通動画と個別動画を結合中");
      await ff.run(
        "-i", "common.mp4", "-i", "handoff.webm",
        "-filter_complex", "[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v0];[1:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", "-map", "0:a?", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "1800k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "output.mp4"
      );
      const data = ff.FS("readFile", "output.mp4");
      if (!data?.length) throw new Error("結合後の動画を作成できませんでした。");
      return new File([data.buffer], `kiseki-event-${Date.now()}.mp4`, { type: "video/mp4" });
    } finally {
      try { ff.exit(); } catch {}
    }
  }

  function compose(commonUrl, handoffBlob, onProgress) {
    const task = composeQueue.then(() => runCompose(commonUrl, handoffBlob, onProgress));
    composeQueue = task.catch(() => {});
    return task;
  }

  window.KisekiEventComposer = { compose };
})();
