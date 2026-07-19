import { COMPOSITE_SETTINGS, normalizeSettings, type Settings } from "../shared/settings";
import { MESSAGE } from "../shared/messages";

/**
 * 팝업은 두 가지 일만 합니다.
 * 1. 사용자가 고른 옵션을 Safari 저장 공간에 보관합니다.
 * 2. 현재 열려 있는 치지직 탭에 화질과 재생 상태를 물어봅니다.
 *
 * 팝업은 방송 화면을 직접 고치지 않습니다. 따라서 팝업을 닫아도 저장된 설정은
 * 치지직 탭에서 계속 적용되고, 전체 기능을 끄면 탭에 즉시 중지 요청을 보냅니다.
 */
interface PlayerStatus {
  quality?: string;
  latency?: string;
  state?: string;
  error?: string | null;
}

let settings = normalizeSettings(undefined);
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let activeTabId: number | null = null;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`팝업 요소를 찾지 못했습니다: ${selector}`);
  return element;
}

/** 현재 보고 있는 탭을 한 번만 찾고, 그 탭의 CHZZK Plus 코드에 요청을 보냅니다. */
async function send(message: unknown): Promise<unknown> {
  if (!Number.isInteger(activeTabId)) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;
  }
  if (!Number.isInteger(activeTabId)) return null;
  try {
    return await browser.tabs.sendMessage(activeTabId as number, message);
  } catch {
    return null;
  }
}

/** 저장된 값을 각 선택 상자와 켜기/끄기 버튼에 그립니다. */
function renderSettings(): void {
  document.body.classList.toggle("disabled", !settings.enabled);
  requiredElement<HTMLInputElement>("#enabled").checked = settings.enabled;

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    const key = control.dataset.setting as keyof Settings;
    const value = settings[key];
    if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = Boolean(value);
    else control.value = String(value);
  });

  document.querySelectorAll<HTMLInputElement>("[data-composite]").forEach((control) => {
    const key = control.dataset.composite as keyof typeof COMPOSITE_SETTINGS;
    control.checked = COMPOSITE_SETTINGS[key].every((settingKey) => Boolean(settings[settingKey]));
  });
}

/** 바뀐 설정을 저장한 뒤 이미 열려 있는 치지직 탭에도 바로 알립니다. */
function saveSettings(): void {
  renderSettings();
  const snapshot = { ...settings };
  void browser.storage.local.set({ settings: snapshot });
  void send({ type: MESSAGE.settings, settings: snapshot });
}

/** 치지직 탭이 보내 준 화질·지연·재생 상태를 위쪽 상태 카드에 표시합니다. */
function renderStatus(payload: unknown): void {
  const response = payload as { status?: PlayerStatus } | null;
  const status = response?.status;
  const diagnostic = requiredElement<HTMLElement>("#diagnostic");
  const label = requiredElement<HTMLSpanElement>("#diagnostic span");
  if (!status) {
    diagnostic.className = "pill offline";
    label.textContent = "치지직 탭에 연결되지 않음";
    return;
  }

  requiredElement("#current-quality").textContent = status.quality || "—";
  requiredElement("#current-latency").textContent = status.latency || "—";
  requiredElement("#player-state").textContent = status.state || "대기";
  diagnostic.className = status.error ? "pill error" : "pill ok";
  label.textContent = status.error ? `오류 · ${status.error}` : "정상 작동 중";
  diagnostic.title = status.error || "CHZZK Plus가 정상 작동 중입니다.";
}

/** 팝업이 열린 동안 1초마다 현재 상태를 다시 확인합니다. */
async function pollStatus(): Promise<void> {
  if (statusTimer) clearTimeout(statusTimer);
  renderStatus(await send({ type: MESSAGE.status }));
  statusTimer = setTimeout(() => void pollStatus(), 1000);
}

/** 저장된 설정을 불러오고 사용자의 조작을 각 설정값에 연결합니다. */
async function init(): Promise<void> {
  const stored = await browser.storage.local.get("settings");
  settings = normalizeSettings(stored.settings);

  requiredElement<HTMLInputElement>("#enabled").addEventListener("change", (event) => {
    settings.enabled = (event.currentTarget as HTMLInputElement).checked;
    saveSettings();
  });

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((control) => {
    control.addEventListener("change", () => {
      const key = control.dataset.setting as keyof Settings;
      const value = control instanceof HTMLInputElement && control.type === "checkbox"
        ? control.checked
        : key === "preferredQuality" ? Number(control.value) : control.value;
      settings = normalizeSettings({ ...settings, [key]: value });
      saveSettings();
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-composite]").forEach((control) => {
    control.addEventListener("change", () => {
      const key = control.dataset.composite as keyof typeof COMPOSITE_SETTINGS;
      const patch = Object.fromEntries(COMPOSITE_SETTINGS[key].map((settingKey) => [settingKey, control.checked]));
      settings = normalizeSettings({ ...settings, ...patch });
      saveSettings();
    });
  });

  renderSettings();
  await pollStatus();
}

addEventListener("pagehide", () => {
  if (statusTimer) clearTimeout(statusTimer);
});
document.addEventListener("DOMContentLoaded", () => void init());
