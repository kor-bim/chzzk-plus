(() => {
  "use strict";
  if (window.__chzzkPlusPlayerInstalled) return;
  window.__chzzkPlusPlayerInstalled = true;

  let settings = { enabled: false, preferredQuality: 1080 };
  let video = null;
  let root = null;
  let core = null;
  let lastApplyAt = 0;
  let lastAppliedKey = "";
  let lastStatusKey = "";
  let lastPlaybackKey = "";
  let lastExternalSeekAt = 0;
  let trackCache = [];
  let trackCacheAt = 0;
  let loopTimer = 0;
  let lastInspectAt = 0;
  let lastStateAt = 0;
  let lastSettingsKey = "";
  let lastErrorKey = "";
  let lastErrorAt = 0;
  const MAX_PLAYBACK_WINDOW = 90;
  const LIVE_EDGE_MARGIN = 0.5;
  const reportError = (message, detail) => {
    const key = `${message}:${detail?.message || ""}`;
    const now = Date.now();
    if (key === lastErrorKey && now - lastErrorAt < 5000) return;
    lastErrorKey = key;
    lastErrorAt = now;
    window.postMessage({
      source: "chzzk-plus-main", type: "DIAGNOSTIC", level: "error", scope: "Player", message, detail
    }, "*");
  };
  const isLiveRoute = () => /^\/live\//.test(location.pathname) || root?.$store?.state?.live === true;
  const findVideo = () => document.querySelector(".pzp-pc video.webplayer-internal-video")
    || document.querySelector("video.webplayer-internal-video")
    || document.querySelector(".pzp-pc video")
    || document.querySelector("video");
  const getActiveVideo = () => video?.isConnected ? video : findVideo();

  const readEdges = (ranges) => {
    if (!ranges?.length) return null;
    try {
      const start = ranges.start(0);
      const end = ranges.end(ranges.length - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { start, end };
    } catch (_) { return null; }
  };

  const getPlaybackEdges = (activeVideo) => {
    const seekable = readEdges(activeVideo.seekable);
    const buffered = readEdges(activeVideo.buffered);
    if (seekable) return { ...seekable, source: "seekable", ok: true };
    if (buffered) return { ...buffered, source: "buffered", ok: true };
    const end = Number.isFinite(activeVideo.duration) ? activeVideo.duration : activeVideo.currentTime;
    return { start: 0, end: Number.isFinite(end) ? end : 0, source: "none", ok: false };
  };

  const getPlaybackWindow = (activeVideo) => {
    const edges = getPlaybackEdges(activeVideo);
    if (!edges.ok) return edges;
    return { ...edges, start: Math.max(edges.start, edges.end - MAX_PLAYBACK_WINDOW) };
  };

  const seekPlayback = (requested, goLive = false) => {
    const activeVideo = getActiveVideo();
    if (!activeVideo) return;
    const edges = getPlaybackWindow(activeVideo);
    if (!edges.ok || edges.end <= edges.start) {
      return;
    }
    const value = goLive ? edges.end - LIVE_EDGE_MARGIN : Number(requested);
    if (!Number.isFinite(value)) return;
    const target = Math.min(edges.end - LIVE_EDGE_MARGIN, Math.max(edges.start, value));
    try {
      lastExternalSeekAt = Date.now();
      activeVideo.currentTime = target;
    } catch (error) {
      reportError("재생바 탐색 실패", { message: error.message, target });
    }
  };

  const findRoot = () => {
    const host = document.querySelector(".pzp, .pzp-pc") || document.querySelector("video")?.parentElement;
    if (!host) return null;
    if (host.__vue__) return host.__vue__;
    for (const element of host.querySelectorAll("*")) if (element.__vue__) return element.__vue__;
    return null;
  };

  const findCore = (node, depth = 0, visited = new Set()) => {
    if (!node || depth > 12 || visited.has(node)) return null;
    visited.add(node);
    if (typeof node.getVideoTracksList === "function") return node;
    for (const child of node.$children || []) {
      const found = findCore(child, depth + 1, visited);
      if (found) return found;
    }
    return node.player && typeof node.player.getVideoTracksList === "function" ? node.player : null;
  };

  const getTracks = (force = false) => {
    const now = performance.now();
    if (!force && trackCacheAt > 0 && now - trackCacheAt < 400) return trackCache;
    try {
      trackCache = Object.values(core?.getVideoTracksList?.() || {}).filter((track) => track && typeof track === "object");
      trackCacheAt = now;
      return trackCache;
    } catch (error) {
      reportError("화질 트랙 조회 실패", { message: error.message });
      return [];
    }
  };
  const selectedTrack = (items) => items.find((track) => track._selected || track.selected || track.isSelected);
  const isLowLatencyTrack = (track) => /\.lowlatency$|_lowlatency/i.test(String(track?.id || ""));
  const chooseTrack = (items, current) => {
    const playable = items.filter((track) => Number(track.height) > 0 && String(track.label || "").toUpperCase() !== "ABR");
    if (!playable.length) return null;
    const preferred = Number(settings.preferredQuality) || 1080;
    const exact = playable.filter((track) => Number(track.height) === preferred);
    const fallbackHeight = Math.max(0, ...playable.map((track) => Number(track.height)).filter((height) => height <= preferred));
    const highestHeight = Math.max(...playable.map((track) => Number(track.height)));
    const heightCandidates = exact.length
      ? exact
      : playable.filter((track) => Number(track.height) === (fallbackHeight || highestHeight));
    const candidates = heightCandidates.length ? heightCandidates : playable;
    const nativeLowLatency = Boolean(root?.$store?.state?.lowLatencyEnabled || root?.$store?.state?.lowLatency || root?.$store?.state?.lowLatencyMode);
    const preserveLowLatency = isLiveRoute() || nativeLowLatency || isLowLatencyTrack(current);
    const matchingLatency = candidates.filter((track) => isLowLatencyTrack(track) === preserveLowLatency);
    return (matchingLatency.length ? matchingLatency : candidates)
      .sort((a, b) => Number(b.videoBitrate || b.bitrate || 0) - Number(a.videoBitrate || a.bitrate || 0))[0];
  };

  const restoreAutomaticQuality = () => {
    const automatic = getTracks().find((track) =>
      /^ABR$/i.test(String(track.id || track.label || ""))
      || /^(auto|자동)$/i.test(String(track.label || "")));
    if (automatic?.id == null || !root?.$store?.dispatch) return;
    try {
      root.$store.dispatch("selectVideoTrack", automatic.id);
      trackCacheAt = 0;
    } catch (_) {}
  };

  const applyPreferred = (reason) => {
    if (!settings.enabled) return;
    const activeVideo = getActiveVideo();
    const items = getTracks();
    const current = selectedTrack(items);
    const target = chooseTrack(items, current);
    if (!target || !root?.$store?.dispatch) return;
    const externalBarRewound = Boolean(document.querySelector(".live-bar-box .go:not(.live)"));
    if (externalBarRewound || Date.now() - lastExternalSeekAt < 15000) {
      return;
    }
    const targetKey = String(target.id ?? target.label ?? target.height);
    const currentKey = String(current?.id ?? current?.label ?? current?.height ?? "");
    if (targetKey === currentKey) return;
    // Safari에서는 선택된 트랙 표식이 비어 있는 경우가 있다. 같은 비디오에
    // 이미 적용한 트랙을 주기적으로 다시 선택하면 라이브 엣지로 복귀한다.
    if (!current && lastAppliedKey === targetKey) return;
    const now = Date.now();
    if (now - lastApplyAt < 4000 && lastAppliedKey === targetKey) return;
    try {
      const shouldResume = Boolean(activeVideo && (!activeVideo.paused || (reason === "플레이어 렌더링" && activeVideo.currentTime < 2)) && isLiveRoute());
      lastApplyAt = now;
      lastAppliedKey = targetKey;
      root.$store.dispatch("selectVideoTrack", target.id);
      trackCacheAt = 0;
      if (shouldResume) setTimeout(() => {
        const currentVideo = getActiveVideo();
        if (currentVideo?.paused) currentVideo.play().catch(() => {});
      }, 500);
    } catch (error) { reportError("선호 화질 적용 실패", { message: error.message, reason }); }
  };

  const getLatencyState = () => {
    const activeVideo = getActiveVideo();
    if (!activeVideo) return null;
    const edges = getPlaybackEdges(activeVideo);
    const currentLatency = Math.max(0, edges.end - activeVideo.currentTime);
    return {
      live: isLiveRoute(),
      currentLatency
    };
  };

  const postState = () => {
    if (!settings.enabled) return;
    const playback = getLatencyState();
    const items = getTracks();
    const current = selectedTrack(items);
    const activeVideo = getActiveVideo();
    const status = {
      quality: current?.height ? `${current.height}p` : activeVideo?.videoHeight ? `${activeVideo.videoHeight}p` : "측정 중",
      latency: playback?.live ? `${playback.currentLatency.toFixed(1)}초` : "—",
      state: !activeVideo ? "플레이어 없음" : activeVideo.error ? `오류 ${activeVideo.error.code}` : activeVideo.readyState < 2 ? "로딩" : activeVideo.seeking ? "탐색 중" : activeVideo.paused ? "일시정지" : "재생 중"
    };
    const key = JSON.stringify(status);
    if (key !== lastStatusKey) {
      lastStatusKey = key;
      window.postMessage({ source: "chzzk-plus-main", type: "PLAYER_STATUS", status }, "*");
    }
  };

  const postPlaybackState = () => {
    if (!settings.enabled || !settings.playbackBarEnabled) return;
    const activeVideo = getActiveVideo();
    if (!activeVideo) return;
    const edges = getPlaybackWindow(activeVideo);
    const currentTime = Number(activeVideo.currentTime) || 0;
    const state = {
      currentTime,
      start: edges.start,
      end: edges.end,
      duration: Math.max(0, edges.end - edges.start),
      seekable: edges.ok,
      source: edges.source,
      atLive: !edges.ok || edges.end - currentTime < 3.5,
      paused: activeVideo.paused
    };
    const key = `${state.currentTime.toFixed(2)}:${state.start.toFixed(2)}:${state.end.toFixed(2)}:${state.seekable}:${state.paused}`;
    if (key === lastPlaybackKey) return;
    lastPlaybackKey = key;
    window.postMessage({
      source: "chzzk-plus-main",
      type: "PLAYBACK_STATE",
      state
    }, "*");
  };

  const inspect = () => {
    if (!settings.enabled) return;
    try {
      const nextVideo = findVideo();
      if (nextVideo !== video || !root || !core) {
        video = nextVideo;
        root = findRoot();
        core = findCore(root);
        lastAppliedKey = "";
        trackCacheAt = 0;
        applyPreferred("플레이어 렌더링");
      } else {
        // 주기적으로 같은 트랙을 다시 선택하면 Safari의 라이브 미디어가
        // 재구성되면서 타임머신 위치가 LIVE 엣지로 초기화될 수 있다.
        // 현재 트랙이 실제로 선호 화질 아래로 떨어진 경우에만 복구한다.
        const current = selectedTrack(getTracks());
        const preferred = Number(settings.preferredQuality) || 1080;
        const degraded = Number(current?.height) > 0 && Number(current.height) < preferred;
        if (degraded && Date.now() - lastApplyAt >= 10000) applyPreferred("화질 저하 복구");
      }
    } catch (error) { reportError("플레이어 검사 실패", { message: error.message }); }
  };

  const runLoop = () => {
    loopTimer = 0;
    if (!settings.enabled) return;
    const now = performance.now();
    if (now - lastInspectAt >= 2500) {
      lastInspectAt = now;
      inspect();
    }
    if (now - lastStateAt >= 1000) {
      lastStateAt = now;
      postState();
    }
    if (!document.hidden) postPlaybackState();
    const delay = document.hidden ? 2000 : settings.playbackBarEnabled ? 250 : 1000;
    loopTimer = setTimeout(runLoop, delay);
  };

  const restartLoop = () => {
    clearTimeout(loopTimer);
    loopTimer = 0;
    lastInspectAt = 0;
    lastStateAt = 0;
    lastPlaybackKey = "";
    if (settings.enabled) runLoop();
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "chzzk-plus-content") return;
    if (event.data.type === "SETTINGS") {
      const wasEnabled = settings.enabled;
      const previous = settings.preferredQuality;
      const next = { ...settings, ...(event.data.settings || {}) };
      const settingsKey = `${next.enabled}:${next.preferredQuality}:${next.playbackBarEnabled}`;
      if (settingsKey === lastSettingsKey) return;
      lastSettingsKey = settingsKey;
      settings = next;
      if (!settings.enabled) {
        if (wasEnabled) restoreAutomaticQuality();
        lastAppliedKey = "";
        restartLoop();
        return;
      }
      if (previous !== settings.preferredQuality) { lastAppliedKey = ""; applyPreferred("선호 화질 변경"); }
      restartLoop();
    }
    if (event.data.type === "PLAYER_COMMAND") {
      if (!settings.enabled) return;
      if (event.data.command === "SEEK") seekPlayback(event.data.target, false);
      if (event.data.command === "GO_LIVE") seekPlayback(null, true);
    }
  });

  document.addEventListener("mousedown", (event) => {
    if (settings.enabled && event.target instanceof Element && event.target.closest(".live-bar-box .slide-box")) {
      lastExternalSeekAt = Date.now();
    }
  }, true);

  document.addEventListener("visibilitychange", restartLoop, { passive: true });

  window.postMessage({ source: "chzzk-plus-main", type: "READY" }, "*");
})();
