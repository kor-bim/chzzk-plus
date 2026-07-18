(() => {
  "use strict";

  /**
   * 화질 선택, 현재 재생 상태 확인, 재생 위치 이동처럼 치지직 플레이어 내부 정보가
   * 필요한 일을 담당합니다. 화면 위 버튼은 다른 파일에서 만들고, 이 파일은 결과만
   * 메시지로 전달합니다. 같은 값은 반복 전송하지 않고 숨긴 탭에서는 검사 횟수를
   * 줄여 CPU 사용량을 낮춥니다.
   */
  if (window.__chzzkPlusPlayerInstalled) return;
  window.__chzzkPlusPlayerInstalled = true;

  interface PlayerSettings {
    enabled: boolean;
    preferredQuality: number;
    playbackBarEnabled: boolean;
  }

  interface VideoTrack {
    id?: string | number;
    label?: string;
    height?: number;
    bitrate?: number;
    videoBitrate?: number;
    selected?: boolean;
    isSelected?: boolean;
    _selected?: boolean;
  }

  interface PlaybackEdges {
    start: number;
    end: number;
    source: "seekable" | "buffered" | "none";
    ok: boolean;
  }

  /** 현재 재생 위치가 들어 있는 버퍼 구간의 남은 길이를 계산합니다. */
  const getBufferLength = (activeVideo: HTMLVideoElement): number => {
    for (let index = 0; index < activeVideo.buffered.length; index += 1) {
      const start = activeVideo.buffered.start(index);
      const end = activeVideo.buffered.end(index);
      if (activeVideo.currentTime >= start - 0.05 && activeVideo.currentTime <= end + 0.05) {
        return Math.max(0, end - activeVideo.currentTime);
      }
    }
    return 0;
  };

  /** 선택된 화질의 내부 이름에서 24·30·60 같은 초당 화면 수를 찾습니다. */
  const readFps = (track?: VideoTrack): number | null => {
    const values = String(track?.id || "").match(/\d+/g)?.map(Number) ?? [];
    return values.find((value) => value >= 20 && value <= 120) ?? null;
  };

  /** 치지직이 서로 다른 단위로 주는 영상 데이터 양을 한 가지 단위로 맞춥니다. */
  const readBitrateKbps = (track?: VideoTrack): number | null => {
    const raw = Number(track?.videoBitrate || track?.bitrate || 0);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw > 100_000 ? raw / 1000 : raw;
  };

  let settings: PlayerSettings = { enabled: false, preferredQuality: 1080, playbackBarEnabled: true };
  let video: HTMLVideoElement | null = null;
  // 치지직은 플레이어 제어 방법을 외부에 공개하지 않습니다. 따라서 플레이어 화면에
  // 연결된 내부 객체를 찾는 좁은 구간에서만 구조가 정해지지 않은 any 타입을 씁니다.
  let root: any = null;
  let core: any = null;
  let lastApplyAt = 0;
  let lastAppliedKey = "";
  let lastStatusKey = "";
  let lastPlaybackKey = "";
  let lastExternalSeekAt = 0;
  let trackCache: VideoTrack[] = [];
  let trackCacheAt = 0;
  let loopTimer = 0;
  let lastInspectAt = 0;
  let lastStateAt = 0;
  let lastSettingsKey = "";
  let lastErrorKey = "";
  let lastErrorAt = 0;
  const MAX_PLAYBACK_WINDOW = 90;
  const LIVE_EDGE_MARGIN = 0.5;
  const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
  const reportError = (message: string, detail?: { message?: string; [key: string]: unknown }): void => {
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
  const findVideo = (): HTMLVideoElement | null => document.querySelector<HTMLVideoElement>(".pzp-pc video.webplayer-internal-video")
    || document.querySelector<HTMLVideoElement>("video.webplayer-internal-video")
    || document.querySelector<HTMLVideoElement>(".pzp-pc video")
    || document.querySelector<HTMLVideoElement>("video");
  const getActiveVideo = (): HTMLVideoElement | null => video?.isConnected ? video : findVideo();

  const readEdges = (ranges: TimeRanges): { start: number; end: number } | null => {
    if (!ranges?.length) return null;
    try {
      const start = ranges.start(0);
      const end = ranges.end(ranges.length - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { start, end };
    } catch { return null; }
  };

  /** Safari가 알려 주는 이동 가능 구간을 우선 사용하고, 없으면 받아 둔 영상 구간을 씁니다. */
  const getPlaybackEdges = (activeVideo: HTMLVideoElement): PlaybackEdges => {
    const seekable = readEdges(activeVideo.seekable);
    const buffered = readEdges(activeVideo.buffered);
    if (seekable) return { ...seekable, source: "seekable", ok: true };
    if (buffered) return { ...buffered, source: "buffered", ok: true };
    const end = Number.isFinite(activeVideo.duration) ? activeVideo.duration : activeVideo.currentTime;
    return { start: 0, end: Number.isFinite(end) ? end : 0, source: "none", ok: false };
  };

  /** 라이브 재생바가 너무 길어지지 않도록 최근 90초만 보여 줄 범위로 자릅니다. */
  const getPlaybackWindow = (activeVideo: HTMLVideoElement): PlaybackEdges => {
    const edges = getPlaybackEdges(activeVideo);
    if (!edges.ok) return edges;
    return { ...edges, start: Math.max(edges.start, edges.end - MAX_PLAYBACK_WINDOW) };
  };

  /** 재생바에서 받은 위치를 실제 이동 가능 범위 안으로 맞춘 뒤 video에 적용합니다. */
  const seekPlayback = (requested: unknown, goLive = false): void => {
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
      reportError("재생바 탐색 실패", { message: errorMessage(error), target });
    }
  };

  /** 현재 플레이어 화면에 연결된 치지직 내부 제어 객체의 시작점을 찾습니다. */
  const findRoot = (): any => {
    const host = document.querySelector(".pzp, .pzp-pc") || document.querySelector("video")?.parentElement;
    if (!host) return null;
    if (host.__vue__) return host.__vue__;
    for (const element of host.querySelectorAll("*")) if (element.__vue__) return element.__vue__;
    return null;
  };

  /** 시작점의 자식들을 제한된 깊이만 확인해 화질 목록을 제공하는 객체를 찾습니다. */
  const findCore = (node: any, depth = 0, visited = new Set<any>()): any => {
    if (!node || depth > 12 || visited.has(node)) return null;
    visited.add(node);
    if (typeof node.getVideoTracksList === "function") return node;
    for (const child of node.$children || []) {
      const found = findCore(child, depth + 1, visited);
      if (found) return found;
    }
    return node.player && typeof node.player.getVideoTracksList === "function" ? node.player : null;
  };

  /** 화질 목록은 0.4초 동안 재사용해 같은 내부 함수를 지나치게 호출하지 않습니다. */
  const getTracks = (force = false): VideoTrack[] => {
    const now = performance.now();
    if (!force && trackCacheAt > 0 && now - trackCacheAt < 400) return trackCache;
    try {
      trackCache = Object.values(core?.getVideoTracksList?.() || {})
        .filter((track): track is VideoTrack => Boolean(track) && typeof track === "object");
      trackCacheAt = now;
      return trackCache;
    } catch (error) {
      reportError("화질 목록 조회 실패", { message: errorMessage(error) });
      return [];
    }
  };
  const selectedTrack = (items: VideoTrack[]): VideoTrack | undefined => items.find((track) => track._selected || track.selected || track.isSelected);
  const isLowLatencyTrack = (track?: VideoTrack): boolean => /\.lowlatency$|_lowlatency/i.test(String(track?.id || ""));
  const chooseTrack = (items: VideoTrack[], current?: VideoTrack): VideoTrack | null => {
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
      .sort((a, b) => Number(b.videoBitrate || b.bitrate || 0) - Number(a.videoBitrate || a.bitrate || 0))[0] ?? null;
  };

  /** 전체 기능을 끌 때 치지직의 기본 자동 화질로 되돌립니다. */
  const restoreAutomaticQuality = (): void => {
    const automatic = getTracks().find((track) =>
      /^ABR$/i.test(String(track.id || track.label || ""))
      || /^(auto|자동)$/i.test(String(track.label || "")));
    if (automatic?.id == null || !root?.$store?.dispatch) return;
    try {
      root.$store.dispatch("selectVideoTrack", automatic.id);
      trackCacheAt = 0;
    } catch {
      // 방송 전환 순간에는 자동 화질 항목이 잠시 사라질 수 있어 다음 검사에서 재시도합니다.
    }
  };

  /** 선호 화질과 가장 가까운 화질을 고르되 현재의 저지연 재생 방식은 유지합니다. */
  const applyPreferred = (reason: string): void => {
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
    // Safari에서는 현재 선택 화질 표시가 비는 경우가 있습니다. 이미 적용한 화질을
    // 계속 다시 고르면 뒤로 이동한 방송이 실시간 위치로 튈 수 있으므로 반복하지 않습니다.
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
    } catch (error) { reportError("선호 화질 적용 실패", { message: errorMessage(error), reason }); }
  };

  const getLatencyState = (): { live: boolean; currentLatency: number } | null => {
    const activeVideo = getActiveVideo();
    if (!activeVideo) return null;
    const edges = getPlaybackEdges(activeVideo);
    // 이동 가능 구간조차 없으면 실시간 끝 위치를 모르므로 0초라고 추측하지 않습니다.
    if (!edges.ok) return null;
    const currentLatency = Math.max(0, edges.end - activeVideo.currentTime);
    return {
      live: isLiveRoute(),
      currentLatency
    };
  };

  /** 팝업과 통계창에서 쓸 값을 실제 video와 현재 선택 화질에서 읽어 보냅니다. */
  const postState = () => {
    if (!settings.enabled) return;
    const playback = getLatencyState();
    const items = getTracks();
    const current = selectedTrack(items);
    const activeVideo = getActiveVideo();
    const quality = activeVideo?.getVideoPlaybackQuality?.();
    const latencySeconds = playback?.live ? playback.currentLatency : null;
    const status = {
      quality: current?.height ? `${current.height}p` : activeVideo?.videoHeight ? `${activeVideo.videoHeight}p` : "측정 중",
      latency: latencySeconds == null ? "—" : `${latencySeconds.toFixed(1)}초`,
      state: !activeVideo ? "플레이어 없음" : activeVideo.error ? `오류 ${activeVideo.error.code}` : activeVideo.readyState < 2 ? "로딩" : activeVideo.seeking ? "탐색 중" : activeVideo.paused ? "일시정지" : "재생 중",
      stats: activeVideo ? {
        resolution: activeVideo.videoWidth && activeVideo.videoHeight
          ? `${activeVideo.videoWidth} × ${activeVideo.videoHeight}`
          : "—",
        bitrateKbps: readBitrateKbps(current),
        fps: readFps(current),
        bufferSeconds: getBufferLength(activeVideo),
        latencySeconds,
        droppedFrames: quality?.droppedVideoFrames ?? 0,
        totalFrames: quality?.totalVideoFrames ?? 0,
        playbackRate: activeVideo.playbackRate,
        volume: activeVideo.muted ? 0 : activeVideo.volume,
        readyState: activeVideo.readyState,
        networkState: activeVideo.networkState
      } : undefined
    };
    const key = JSON.stringify(status);
    if (key !== lastStatusKey) {
      lastStatusKey = key;
      window.postMessage({ source: "chzzk-plus-main", type: "PLAYER_STATUS", status }, "*");
    }
  };

  /** 재생바가 그릴 현재 위치와 이동 가능 범위를 보냅니다. */
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

  /** 방송 전환으로 플레이어가 교체됐는지 보고 선호 화질을 다시 적용합니다. */
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
        // 같은 화질을 계속 다시 고르면 뒤로 이동한 위치가 실시간으로 초기화될 수 있습니다.
        // 실제 화질이 선호값보다 낮아졌을 때만 제한적으로 다시 적용합니다.
        const current = selectedTrack(getTracks());
        const preferred = Number(settings.preferredQuality) || 1080;
        const degraded = current != null && Number(current.height) > 0 && Number(current.height) < preferred;
        if (degraded && Date.now() - lastApplyAt >= 10000) applyPreferred("화질 저하 복구");
      }
    } catch (error) { reportError("플레이어 검사 실패", { message: errorMessage(error) }); }
  };

  /** 화면이 보일 때는 재생바를 부드럽게, 숨긴 탭에서는 드물게 갱신합니다. */
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

  /** 설정 변경이나 탭 표시 상태 변경 뒤 갱신 일정을 안전하게 다시 시작합니다. */
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
