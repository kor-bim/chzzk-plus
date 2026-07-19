import { findPlayerCore, findPlayerRoot, findVideo, readTracks, selectedTrack } from "./quality-detector";
import { choosePreferredTrack, isLowLatencyTrack } from "./quality-controller";
import { mergeQualitySettings, type QualitySettings } from "./settings-menu";
import { isLiveRoute } from "../../../shared/chzzk-route";

declare global {
  interface Window { __chzzkPlusQualityInstalled?: boolean; }
}

(() => {
  if (window.__chzzkPlusQualityInstalled) return;
  window.__chzzkPlusQualityInstalled = true;
  let settings: QualitySettings = { enabled: false, preferredQuality: 1080 };
  let root: any = null;
  let core: any = null;
  let video: HTMLVideoElement | null = null;
  let timer = 0;
  let lastApplied = "";
  let lastApplyAt = 0;
  let lastUserSeekAt = 0;

  const automatic = (): void => {
    const track = readTracks(core).find((item) => /^ABR$/i.test(String(item.id || item.label || "")) || /^(auto|자동)$/i.test(String(item.label || "")));
    if (track?.id != null) root?.$store?.dispatch?.("selectVideoTrack", track.id);
  };

  const apply = (force = false): void => {
    if (!settings.enabled || Date.now() - lastUserSeekAt < 15_000) return;
    const tracks = readTracks(core);
    const current = selectedTrack(tracks);
    const target = choosePreferredTrack(
      tracks,
      Number(settings.preferredQuality) || 1080,
      isLiveRoute() || isLowLatencyTrack(current)
    );
    if (!target?.id || !root?.$store?.dispatch) return;
    const key = String(target.id);
    if (String(current?.id ?? "") === key || (!force && key === lastApplied && Date.now() - lastApplyAt < 10_000)) return;
    try {
      lastApplied = key;
      lastApplyAt = Date.now();
      root.$store.dispatch("selectVideoTrack", target.id);
    } catch (error) {
      window.postMessage({ source: "chzzk-plus-main", type: "DIAGNOSTIC", level: "error", scope: "Player", message: "선호 화질 적용 실패", detail: error }, "*");
    }
  };

  const inspect = (): void => {
    if (!settings.enabled) return;
    const nextVideo = findVideo();
    if (nextVideo !== video || !root || !core) {
      video = nextVideo;
      root = findPlayerRoot();
      core = findPlayerCore(root);
      lastApplied = "";
      apply(true);
    } else {
      const current = selectedTrack(readTracks(core));
      if (current && Number(current.height) < settings.preferredQuality) apply();
    }
  };

  const loop = (): void => {
    clearTimeout(timer);
    if (!settings.enabled) return;
    inspect();
    timer = setTimeout(loop, document.hidden ? 5000 : 2500);
  };

  addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "chzzk-plus-content" || event.data.type !== "SETTINGS") return;
    const wasEnabled = settings.enabled;
    const previousQuality = settings.preferredQuality;
    settings = mergeQualitySettings(settings, event.data.settings);
    if (settings.enabled) document.documentElement.dataset.chzzkPlusQuality = "fixed";
    else delete document.documentElement.dataset.chzzkPlusQuality;
    if (wasEnabled && !settings.enabled) automatic();
    if (previousQuality !== settings.preferredQuality) lastApplied = "";
    loop();
  });
  document.addEventListener("mousedown", (event) => {
    if (event.target instanceof Element && event.target.closest("#chzzk-plus-playback-bar,.live-bar-box")) lastUserSeekAt = Date.now();
  }, true);
  document.addEventListener("visibilitychange", loop, { passive: true });
  window.postMessage({ source: "chzzk-plus-main", type: "READY", module: "video-quality" }, "*");
})();
