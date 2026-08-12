(() => {
  const heroVideo = document.getElementById("lp-hero-video");
  if (!heroVideo) return;

  // iOS Safariでは、属性だけでなくDOMプロパティも先に指定すると
  // ミュート状態のインライン自動再生が安定する。
  heroVideo.muted = true;
  heroVideo.defaultMuted = true;
  heroVideo.playsInline = true;

  const tryPlay = () => {
    if (!heroVideo.paused) return;
    const playback = heroVideo.play();
    playback?.catch?.(() => {
      // 省電力モードなどで自動再生できない場合もposterを表示し、
      // 最初のユーザー操作時にもう一度再生を試みる。
    });
  };

  if (heroVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    tryPlay();
  } else {
    heroVideo.addEventListener("loadeddata", tryPlay, { once: true });
  }

  window.addEventListener("pageshow", tryPlay);
  document.addEventListener("touchstart", tryPlay, { once: true, passive: true });
  document.addEventListener("pointerdown", tryPlay, { once: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryPlay();
  });
})();
