(() => {
  "use strict";

  const CP = globalThis.ChzzkPlus = globalThis.ChzzkPlus || {};

  CP.DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    sharpnessEnabled: false,
    sharpnessIntensity: 1.8,
    preferredQuality: 1080,
    playbackBarEnabled: true,
    streamStatsEnabled: true,
    statsContextMenuEnabled: true,
    autoAdSkip: true,
    networkAdBlock: true,
    adPopupRemoval: true,
    screenshotEnabled: true,
    rankingHideEnabled: true,
    blindedRestoreEnabled: true,
    blindedAutoRestoreEnabled: false
  });

  CP.SELECTORS = Object.freeze({
    video: "video.webplayer-internal-video, video",
    player: ".pzp, .pzp-pc, div.chzzk_player, [class*=\"live_player\"]",
    playerPc: ".pzp-pc",
    playerBottom: ".pzp-pc__bottom, .pzp-pc-bottom, div:has(> :is([class*=\"slider_wrap__\"], button[class*=\"_wrap_\"]))",
    settingsMenu: ".pzp-pc__settings",
    rightControls: ".pzp-pc__bottom-buttons-right, .pzp-pc-bottom-buttons-right, div:has(> .pzp-pc-setting-button, > .pzp-ui-setting-button, > button[aria-label=\"설정\"], > button[aria-label=\"화질\"])",
    settingButton: ".pzp-pc-setting-button, .pzp-ui-setting-button, button[aria-label=\"설정\"]",
    contextPane: ".pzp-contextmenu-pane.pzp-pc-contextmenu-pane.pzp-pc__contextmenu-pane",
    contextList: ".pzp-contextmenu-pane__list"
  });

  CP.ext = globalThis.browser || globalThis.chrome;
  CP.settings = { ...CP.DEFAULT_SETTINGS };
  CP.modules = {};
  CP.actions = {};
  CP.playerStatus = { quality: "—", latency: "—", state: "플레이어 대기", error: null };

  CP.Debug = class Debug {
    static lastError = "";
    static lastErrorAt = 0;

    static info() {}
    static warn() {}

    static error(scope, message) {
      CP.playerStatus.error = message;
      const now = Date.now();
      if (Debug.lastError === message && now - Debug.lastErrorAt < 5000) return;
      Debug.lastError = message;
      Debug.lastErrorAt = now;
      CP.Toast?.show(`확장 프로그램 오류: ${message}`, "error");
    }

    static write(level, scope, message) {
      if (level === "error") Debug.error(scope, message);
    }
  };

  CP.normalizeSettings = (value) => {
    const source = value || {};
    const normalized = Object.fromEntries(Object.entries(CP.DEFAULT_SETTINGS).map(([key, fallback]) => [
      key,
      Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback
    ]));
    normalized.sharpnessIntensity = Math.max(1, Math.min(3, Number(normalized.sharpnessIntensity) || 1.8));
    return normalized;
  };

  CP.postSettingsToPage = () => {
    window.postMessage({ source: "chzzk-plus-content", type: "SETTINGS", settings: CP.settings }, "*");
  };

  CP.patchSettings = async (patch) => {
    const next = CP.normalizeSettings({ ...CP.settings, ...patch });
    CP.settings = next;
    CP.onSettingsChanged?.(next);
    await CP.ext.storage.local.set({ settings: next });
  };

  CP.injectPageScripts = async () => {
    for (const resource of ["page/network.js", "page/blinded.js", "page/player.js"]) {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = CP.ext.runtime.getURL(resource);
        script.async = false;
        script.onload = () => { script.remove(); resolve(); };
        script.onerror = () => { CP.Debug.error("Runtime", `${resource} 주입 실패`); script.remove(); resolve(); };
        (document.head || document.documentElement).appendChild(script);
      });
      CP.postSettingsToPage();
    }
  };

  CP.findVideo = () => document.querySelector(".pzp-pc video.webplayer-internal-video")
    || document.querySelector("video.webplayer-internal-video")
    || document.querySelector(".pzp-pc video")
    || document.querySelector("video");
  CP.findPlayer = (video = CP.findVideo()) => video?.closest(CP.SELECTORS.player) || video?.parentElement || null;

  CP.readPlayerStatus = () => {
    const video = CP.findVideo();
    if (!video) return { ...CP.playerStatus, quality: "—", latency: "—", state: "플레이어 없음" };
    const edge = video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : null;
    const state = video.error ? `오류 ${video.error.code}`
      : video.readyState < 2 ? "로딩"
      : video.seeking ? "탐색 중"
      : video.paused ? "일시정지" : "재생 중";
    return {
      ...CP.playerStatus,
      quality: CP.playerStatus.quality !== "—" ? CP.playerStatus.quality : (video.videoHeight ? `${video.videoHeight}p` : "측정 중"),
      latency: edge == null ? "—" : `${Math.max(0, edge - video.currentTime).toFixed(1)}초`,
      state
    };
  };

  CP.formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const value = Math.floor(seconds);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  CP.formatOffset = (seconds) => seconds < -0.5 ? `-${CP.formatTime(Math.abs(seconds))}` : "00:00";

  CP.Toast = class Toast {
    static show(message, tone = "normal") {
      let root = document.querySelector("#chzzk-plus-toast");
      if (!root) {
        root = document.createElement("div");
        root.id = "chzzk-plus-toast";
        document.documentElement.appendChild(root);
      }
      root.dataset.tone = tone;
      root.textContent = message;
      root.classList.add("show");
      clearTimeout(CP.Toast.timer);
      CP.Toast.timer = setTimeout(() => root.classList.remove("show"), 1800);
    }
  };
})();
