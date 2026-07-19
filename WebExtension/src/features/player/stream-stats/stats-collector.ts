import type { StreamStatistics } from "../../../runtime/extension-runtime";
import type { CollectedStreamStats } from "./stats-types";
import { findPlayerCore, findPlayerRoot, readTracks, selectedTrack } from "../video-quality/quality-detector";

declare global {
  interface Window { __chzzkPlusStatsInstalled?: boolean; }
}

/** 브라우저 video 요소에서 직접 확인 가능한 값만 수집합니다. */
export class StreamStatsCollector {
  #video: HTMLVideoElement | null = null;
  #frameHandle = 0;
  #frameTimes: number[] = [];
  #previousDropped = 0;

  use(video: HTMLVideoElement): void {
    if (this.#video === video) return;
    this.stop();
    this.#video = video;
    const callback = (now: number): void => {
      if (!this.#video) return;
      this.#frameTimes.push(now);
      const cutoff = now - 1_000;
      while (this.#frameTimes[0] != null && this.#frameTimes[0] < cutoff) this.#frameTimes.shift();
      this.#frameHandle = this.#video.requestVideoFrameCallback(callback);
    };
    this.#frameHandle = video.requestVideoFrameCallback(callback);
  }

  snapshot(video: HTMLVideoElement, source?: StreamStatistics): CollectedStreamStats {
    this.use(video);
    const quality = video.getVideoPlaybackQuality?.();
    const droppedFrames = source?.droppedFrames ?? quality?.droppedVideoFrames ?? 0;
    const droppedFramesRecent = Math.max(0, droppedFrames - this.#previousDropped);
    this.#previousDropped = droppedFrames;
    const ranges = Array.from({ length: video.buffered.length }, (_, index) =>
      `${video.buffered.start(index).toFixed(3)}-${video.buffered.end(index).toFixed(3)}`);
    const activeRange = ranges.length ? this.#activeBufferRange(video) : null;
    return {
      resolution: source?.resolution || (video.videoWidth && video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : "—"),
      trackBitrateKbps: source?.bitrateKbps ?? null,
      actualFps: this.#frameTimes.length > 1 ? this.#frameTimes.length - 1 : null,
      bufferSeconds: source?.bufferSeconds ?? this.#bufferLength(video),
      latencySeconds: source?.latencySeconds ?? null,
      droppedFrames,
      droppedFramesRecent,
      totalFrames: source?.totalFrames ?? quality?.totalVideoFrames ?? 0,
      playbackRate: source?.playbackRate ?? video.playbackRate,
      volume: source?.volume ?? (video.muted ? 0 : video.volume),
      readyState: source?.readyState ?? video.readyState,
      networkState: source?.networkState ?? video.networkState,
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      seeking: video.seeking,
      bufferedStart: activeRange?.start ?? null,
      bufferedEnd: activeRange?.end ?? null,
      bufferedRanges: ranges.join(", ") || "없음",
      trackId: source?.trackId ?? null,
      codec: source?.codec ?? null
    };
  }

  #activeBufferRange(video: HTMLVideoElement): { start: number; end: number } | null {
    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = video.buffered.start(index);
      const end = video.buffered.end(index);
      if (video.currentTime >= start - .05 && video.currentTime <= end + .05) return { start, end };
    }
    return null;
  }

  #bufferLength(video: HTMLVideoElement): number {
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (video.currentTime >= video.buffered.start(index) - 0.05
        && video.currentTime <= video.buffered.end(index) + 0.05) {
        return Math.max(0, video.buffered.end(index) - video.currentTime);
      }
    }
    return 0;
  }

  stop(): void {
    if (this.#video && this.#frameHandle) this.#video.cancelVideoFrameCallback(this.#frameHandle);
    this.#video = null;
    this.#frameHandle = 0;
    this.#frameTimes = [];
    this.#previousDropped = 0;
  }
}

/** 치지직 사이트 내부에서 팝업과 통계 패널에 전달할 기본 상태 수집을 시작합니다. */
export function installWebsiteStreamStats(): void {
  if (window.__chzzkPlusStatsInstalled) return;
  window.__chzzkPlusStatsInstalled = true;
  let enabled = false;
  let timer = 0;
  let lastStatus = "";
  let playerRoot: any = null;
  let playerCore: any = null;

  const findVideo = (): HTMLVideoElement | null => document.querySelector<HTMLVideoElement>(".pzp-pc video.webplayer-internal-video, video.webplayer-internal-video, .pzp-pc video, video");
  const buffer = (video: HTMLVideoElement): number => {
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (video.currentTime >= video.buffered.start(index) - .05 && video.currentTime <= video.buffered.end(index) + .05) return Math.max(0, video.buffered.end(index) - video.currentTime);
    }
    return 0;
  };
  const edge = (video: HTMLVideoElement): number | null => {
    try { return video.seekable.length ? video.seekable.end(video.seekable.length - 1) : null; } catch { return null; }
  };
  const post = (): void => {
    const video = findVideo();
    if (!playerRoot || !playerCore) {
      playerRoot = findPlayerRoot();
      playerCore = findPlayerCore(playerRoot);
    }
    const track = selectedTrack(readTracks(playerCore));
    const rawBitrate = Number(track?.videoBitrate || track?.bitrate || 0);
    const bitrateKbps = Number.isFinite(rawBitrate) && rawBitrate > 0 ? (rawBitrate > 100_000 ? rawBitrate / 1000 : rawBitrate) : null;
    const liveEdge = video ? edge(video) : null;
    const live = /^\/live\//.test(location.pathname);
    const latencySeconds = live && video && liveEdge != null ? Math.max(0, liveEdge - video.currentTime) : null;
    const quality = video?.getVideoPlaybackQuality?.();
    const status = {
      quality: video?.videoHeight ? `${video.videoHeight}p` : "측정 중",
      latency: latencySeconds == null ? "—" : `${latencySeconds.toFixed(1)}초`,
      state: !video ? "플레이어 없음" : video.error ? `오류 ${video.error.code}` : video.readyState < 2 ? "로딩" : video.seeking ? "탐색 중" : video.paused ? "일시정지" : "재생 중",
      stats: video ? {
        resolution: video.videoWidth && video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : "—",
        bitrateKbps, bufferSeconds: buffer(video), latencySeconds,
        droppedFrames: quality?.droppedVideoFrames ?? 0, totalFrames: quality?.totalVideoFrames ?? 0,
        playbackRate: video.playbackRate, volume: video.muted ? 0 : video.volume,
        readyState: video.readyState, networkState: video.networkState,
        trackId: track?.id == null ? null : String(track.id),
        codec: String(track?.codec || track?.videoCodec || track?.mimeType || "") || null
      } : undefined
    };
    const key = JSON.stringify(status);
    if (key !== lastStatus) {
      lastStatus = key;
      window.postMessage({ source: "chzzk-plus-main", type: "PLAYER_STATUS", status }, "*");
    }
  };
  const loop = (): void => {
    clearTimeout(timer);
    if (!enabled) return;
    post();
    timer = setTimeout(loop, document.hidden ? 2000 : 1000);
  };
  addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "chzzk-plus-content" || event.data.type !== "SETTINGS") return;
    enabled = event.data.settings?.enabled !== false;
    loop();
  });
  document.addEventListener("visibilitychange", loop, { passive: true });
  window.postMessage({ source: "chzzk-plus-main", type: "READY", module: "stream-stats" }, "*");
}
