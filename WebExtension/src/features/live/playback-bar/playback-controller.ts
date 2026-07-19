import { findLiveVideo, readPlaybackEdges } from "./playback-state";
import { isLiveRoute } from "../../../shared/chzzk-route";
import { MESSAGE } from "../../../shared/messages";

declare global {
  interface Window { __chzzkPlusLivePlaybackInstalled?: boolean; }
}

/** 화면에서 선택한 위치를 사이트 내부 라이브 제어 모듈에 전달합니다. */
export function sendPlaybackCommand(command: "SEEK" | "GO_LIVE", target?: number): void {
  window.postMessage({ source: "chzzk-plus-content", type: MESSAGE.playerCommand, command, target }, "*");
}

/** 사이트 내부에서 라이브 위치를 수집하고 재생바 명령을 실제 video에 적용합니다. */
export function installLivePlaybackController(): void {
  if (window.__chzzkPlusLivePlaybackInstalled) return;
  window.__chzzkPlusLivePlaybackInstalled = true;
  let settings = { enabled: false, playbackBarEnabled: true };
  let timer = 0;
  let lastState = "";
  const edges = (video: HTMLVideoElement) => {
    const value = readPlaybackEdges(video);
    return value.ok ? { ...value, start: Math.max(value.start, value.end - 90) } : value;
  };
  const seek = (requested: unknown, live: boolean): void => {
    const video = findLiveVideo(); if (!video) return;
    const range = edges(video); if (!range.ok || range.end <= range.start) return;
    const value = live ? range.end - .5 : Number(requested); if (!Number.isFinite(value)) return;
    video.currentTime = Math.min(range.end - .5, Math.max(range.start, value));
  };
  const post = (): void => {
    if (!isLiveRoute()) return;
    const video = findLiveVideo(); if (!video) return;
    const range = edges(video); const currentTime = Number(video.currentTime) || 0;
    const state = { currentTime, start: range.start, end: range.end, seekable: range.ok, atLive: !range.ok || range.end - currentTime < 3.5, paused: video.paused };
    const key = `${currentTime.toFixed(2)}:${range.start.toFixed(2)}:${range.end.toFixed(2)}:${video.paused}`;
    if (key !== lastState) { lastState = key; window.postMessage({ source: "chzzk-plus-main", type: "PLAYBACK_STATE", state }, "*"); }
  };
  const loop = (): void => { clearTimeout(timer); if (!settings.enabled || !settings.playbackBarEnabled) return; post(); timer = setTimeout(loop, document.hidden ? 2000 : 250); };
  addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "chzzk-plus-content") return;
    if (event.data.type === MESSAGE.websiteSettings) { settings = { ...settings, ...event.data.settings }; loop(); }
    if (event.data.type === MESSAGE.playerCommand && settings.enabled) {
      if (event.data.command === "SEEK") seek(event.data.target, false);
      if (event.data.command === "GO_LIVE") seek(null, true);
    }
  });
  document.addEventListener("visibilitychange", loop, { passive: true });
  window.postMessage({ source: "chzzk-plus-main", type: "READY", module: "live-playback" }, "*");
}
