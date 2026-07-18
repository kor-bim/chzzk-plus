import { FeatureRegistry } from "../core/feature";
import { DomObserver } from "./dom-observer";
import { normalizeSettings, type Settings } from "../core/settings";
import { CP } from "./runtime";
import { Sharpness } from "../features/sharpness";
import { PlaybackBar } from "../features/playback-bar";
import { StreamStats } from "../features/stream-stats";
import { Screenshot } from "../features/screenshot";
import { AdUi } from "../features/ad-ui";
import { ChatStyle } from "../features/chat-style";

/**
 * 치지직 탭에서 가장 먼저 실행되는 화면 관리 파일입니다.
 *
 * 직접 기능을 구현하기보다 다음 순서를 조정합니다.
 * 1. Safari에 저장된 설정을 읽습니다.
 * 2. 선명도, 재생바, 통계 같은 기능을 등록합니다.
 * 3. 치지직이 화면을 다시 그리면 각 기능이 버튼과 메뉴를 다시 찾게 합니다.
 * 4. 팝업과 치지직 페이지 안쪽 코드가 보낸 메시지를 필요한 기능에 전달합니다.
 * 5. 한 기능에서 오류가 나도 다른 기능은 계속 실행되도록 분리합니다.
 */
class App {
  readonly #domObserver = new DomObserver();
  readonly #registry = new FeatureRegistry((scope, message, error) => CP.Debug.error(scope, message, error));
  #pageScriptRequested = false;
  #settingsKey = "";

  constructor() {
    // 기능 순서는 화면 겹침과 관계없는 독립 모듈이므로 등록 순서대로만 관리합니다.
    this.#registry
      .register(new Sharpness())
      .register(new PlaybackBar())
      .register(new StreamStats())
      .register(new Screenshot())
      .register(new AdUi())
      .register(new ChatStyle());
    this.#domObserver.subscribe((root) => this.#registry.scan(root));
  }

  #ensurePageScript(): void {
    // 화면 변화 알림이 여러 번 와도 치지직 내부 기능 코드는 한 번만 실행 요청합니다.
    if (this.#pageScriptRequested) return;
    this.#pageScriptRequested = true;
    CP.injectPageScripts().catch(() => {
      this.#pageScriptRequested = false;
    });
  }

  /** 새 설정을 적용하고 켜짐 상태에 맞춰 화면 감시와 기능을 시작하거나 멈춥니다. */
  async update(nextSettings: unknown): Promise<void> {
    const normalized = normalizeSettings(nextSettings);
    // 팝업이 같은 설정을 반복해서 보내도 화면을 다시 검사하지 않습니다.
    const settingsKey = JSON.stringify(normalized);
    if (settingsKey === this.#settingsKey) return;
    this.#settingsKey = settingsKey;
    CP.settings = normalized;

    if (normalized.enabled) {
      this.#domObserver.start();
      this.#ensurePageScript();
    } else {
      this.#domObserver.pause();
    }

    await this.#registry.update(normalized);
    CP.postSettingsToPage();
    if (normalized.enabled) this.#registry.scan();
  }

  /** 탭을 처음 열었을 때 저장 설정을 읽고 변경 알림을 연결합니다. */
  async start(): Promise<void> {
    CP.onSettingsChanged = (settings: Settings) => void this.update(settings);
    const stored = await CP.ext.storage.local.get("settings");
    await this.update(stored.settings);
  }

  /** 탭을 닫을 때 감시, 이벤트, 타이머와 추가한 화면 요소를 정리합니다. */
  async stop(): Promise<void> {
    this.#domObserver.stop();
    await this.#registry.stop();
  }
}

const app = new App();
void app.start();
let lastAdToastAt = 0;

CP.ext.storage.onChanged.addListener((changes: any, area: string) => {
  // 팝업에서 설정을 바꾸면 열려 있는 치지직 탭도 즉시 같은 설정을 적용합니다.
  if (area === "local" && changes.settings) void app.update(changes.settings.newValue);
});

CP.ext.runtime.onMessage.addListener((message: any) => {
  // 팝업과 background에서 직접 보내는 요청입니다.
  if (message?.type === "CHZZK_PLUS_SETTINGS") void app.update(message.settings);
  if (message?.type === "CHZZK_PLUS_CAPTURE") CP.actions.captureScreenshot?.();
  if (message?.type === "CHZZK_PLUS_GET_STATUS") return Promise.resolve({ status: CP.readPlayerStatus() });
  return undefined;
});

window.addEventListener("message", (event) => {
  // 치지직 페이지 안쪽 코드와 확장 화면 코드는 서로의 변수를 직접 볼 수 없으므로
  // 재생 상태, 오류, 광고 처리 결과를 메시지로 전달받습니다.
  if (event.source !== window || event.data?.source !== "chzzk-plus-main") return;
  switch (event.data.type) {
    case "READY":
      CP.postSettingsToPage();
      break;
    case "PLAYER_STATUS":
      CP.playerStatus = { ...CP.playerStatus, ...event.data.status };
      break;
    case "PLAYBACK_STATE":
      CP.actions.updatePlaybackState?.(event.data.state);
      break;
    case "DIAGNOSTIC":
      if (event.data.level === "error") CP.Debug.error(event.data.scope || "Page", event.data.message || "오류");
      break;
    case "AD_BLOCKED": {
      const now = Date.now();
      if (now - lastAdToastAt > 6000) {
        lastAdToastAt = now;
        CP.Toast.show(`광고 차단 · ${event.data.label || "처리 완료"}`);
      }
      break;
    }
    default:
      break;
  }
});

const extensionBase = CP.ext.runtime.getURL("");
// 확장 프로그램 파일에서 발생한 처리되지 않은 오류만 잡아 사용자에게 알려 줍니다.
addEventListener("error", (event) => {
  const stack = event.error?.stack || "";
  if ((event.filename || "").startsWith(extensionBase) || stack.includes(extensionBase)) {
    CP.Debug.error("Content", event.message || "처리되지 않은 오류", event.error);
  }
});
addEventListener("unhandledrejection", (event) => {
  const stack = event.reason?.stack || "";
  if (stack.includes(extensionBase)) CP.Debug.error("Content", "처리되지 않은 Promise 오류", event.reason);
});
addEventListener("pagehide", () => void app.stop(), { once: true });
