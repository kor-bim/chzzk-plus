const DEFAULTS = {
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
};

const COMPOSITES = {
  streamStats: ["streamStatsEnabled", "statsContextMenuEnabled"],
  adBlock: ["networkAdBlock", "autoAdSkip", "adPopupRemoval"],
  blindedChat: ["blindedRestoreEnabled", "blindedAutoRestoreEnabled"]
};

let settings = { ...DEFAULTS };
let statusTimer = 0;
let activeTabId = null;

async function send(message) {
  if (!Number.isInteger(activeTabId)) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;
  }
  if (!Number.isInteger(activeTabId)) return null;
  try { return await browser.tabs.sendMessage(activeTabId, message); }
  catch (_) { return null; }
}

function renderSettings() {
  document.body.classList.toggle("disabled", !settings.enabled);
  document.querySelector("#enabled").checked = settings.enabled;
  document.querySelectorAll("[data-setting]").forEach((control) => {
    const value = settings[control.dataset.setting];
    if (control.type === "checkbox") control.checked = Boolean(value);
    else control.value = String(value);
  });
  document.querySelectorAll("[data-composite]").forEach((control) => {
    control.checked = COMPOSITES[control.dataset.composite].every((key) => Boolean(settings[key]));
  });
}

function scheduleSave() {
  renderSettings();
  const snapshot = { ...settings };
  browser.storage.local.set({ settings: snapshot }).catch(() => {});
  send({ type: "CHZZK_PLUS_SETTINGS", settings: snapshot }).catch(() => {});
}

function renderStatus(payload) {
  const status = payload?.status;
  const diagnostic = document.querySelector("#diagnostic");
  if (!status) {
    diagnostic.className = "offline";
    diagnostic.querySelector("span").textContent = "치지직 탭에 연결되지 않음";
    return;
  }
  document.querySelector("#current-quality").textContent = status.quality || "—";
  document.querySelector("#current-latency").textContent = status.latency || "—";
  document.querySelector("#player-state").textContent = status.state || "대기";
  const error = status.error;
  diagnostic.className = error ? "error" : "ok";
  diagnostic.querySelector("span").textContent = error ? `오류 · ${error}` : "정상 작동 중";
  diagnostic.title = error || "CHZZK Plus가 정상 작동 중입니다.";
}

async function pollStatus() {
  clearTimeout(statusTimer);
  renderStatus(await send({ type: "CHZZK_PLUS_GET_STATUS" }));
  statusTimer = setTimeout(pollStatus, 1000);
}

async function init() {
  const stored = await browser.storage.local.get("settings");
  const previous = stored.settings || {};
  settings = Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [
    key,
    Object.prototype.hasOwnProperty.call(previous, key) ? previous[key] : fallback
  ]));

  document.querySelector("#enabled").addEventListener("change", (event) => {
    settings.enabled = event.target.checked;
    scheduleSave();
  });
  document.querySelectorAll("[data-setting]").forEach((control) => {
    control.addEventListener("change", () => {
      const key = control.dataset.setting;
      settings[key] = control.type === "checkbox" ? control.checked : key === "preferredQuality" ? Number(control.value) : control.value;
      scheduleSave();
    });
  });
  document.querySelectorAll("[data-composite]").forEach((control) => {
    control.addEventListener("change", () => {
      COMPOSITES[control.dataset.composite].forEach((key) => { settings[key] = control.checked; });
      scheduleSave();
    });
  });
  renderSettings();
  pollStatus();
}

addEventListener("pagehide", () => {
  clearTimeout(statusTimer);
});
document.addEventListener("DOMContentLoaded", init);
