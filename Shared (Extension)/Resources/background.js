const DEFAULT_SETTINGS = Object.freeze({
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

async function initializeSettings() {
  const stored = await browser.storage.local.get("settings");
  const previous = stored.settings || {};
  await browser.storage.local.set({
    settings: Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [
      key,
      Object.prototype.hasOwnProperty.call(previous, key) ? previous[key] : fallback
    ]))
  });
}

browser.runtime.onInstalled.addListener(initializeSettings);

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === "GET_DEFAULT_SETTINGS") {
    return { ...DEFAULT_SETTINGS };
  }
  if (message?.type === "CAPTURE_VISIBLE_TAB") {
    if (typeof browser.tabs?.captureVisibleTab !== "function") {
      throw new Error("Safari가 탭 캡처 API를 지원하지 않습니다.");
    }
    const options = { format: "png" };
    const dataUrl = Number.isInteger(message.windowId)
      ? await browser.tabs.captureVisibleTab(message.windowId, options)
      : await browser.tabs.captureVisibleTab(options);
    return { dataUrl };
  }
  return undefined;
});
