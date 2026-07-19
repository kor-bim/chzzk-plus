import { normalizeSettings } from "../shared/settings";
import { MESSAGE } from "../shared/messages";

/**
 * Safari가 확장 프로그램을 켤 때 뒤에서 실행하는 파일입니다.
 *
 * 화면을 직접 꾸미지는 않고 다음 세 가지 일을 담당합니다.
 * 1. 처음 설치했을 때 설정값을 준비합니다.
 * 2. 치지직 내부 영상 기능을 다룰 `page.js`를 치지직 페이지 안에서 실행합니다.
 * 3. 스크린샷 기능이 요청하면 현재 Safari 탭을 이미지로 캡처합니다.
 *
 * 일반 확장 코드와 치지직 사이트 코드는 보안상 서로 분리되어 있습니다. 그래서
 * 화질 선택이나 광고 응답 변경처럼 사이트 안쪽에서 해야 하는 작업은 이 파일이
 * `page.js`를 별도로 실행해 줘야 합니다.
 */
const PAGE_SCRIPT = "page.js";

function isMessage(value: unknown): value is { type: string; windowId?: number; channelId?: string } {
  return typeof value === "object" && value !== null && "type" in value;
}

/**
 * Safari 콘텐츠 스크립트는 다른 호스트의 API를 직접 호출할 때 CORS 제한을 받을 수
 * 있습니다. 호스트 권한이 있는 백그라운드에서 공개 라이브 정보를 대신 가져옵니다.
 */
async function fetchLiveDetail(channelId: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  if (!/^[a-f0-9]{32}$/i.test(channelId)) return { ok: false, error: "올바르지 않은 채널 주소입니다." };
  const response = await fetch(`https://api.chzzk.naver.com/service/v3/channels/${channelId}/live-detail`, {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) return { ok: false, error: `방송 정보를 불러오지 못했습니다. (${response.status})` };
  return { ok: true, data: await response.json() };
}

/** 요청을 보낸 치지직 탭과 프레임을 찾아 page.js를 같은 페이지 안에서 실행합니다. */
async function injectPageScript(sender: browser.runtime.MessageSender): Promise<{ ok: boolean; error?: string }> {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) throw new Error("실행할 치지직 탭을 찾지 못했습니다.");
  if (typeof browser.scripting?.executeScript !== "function") {
    throw new Error("현재 Safari가 메인 페이지 스크립트 실행을 지원하지 않습니다.");
  }

  await browser.scripting.executeScript({
    target: {
      tabId: tabId as number,
      frameIds: [Number.isInteger(sender.frameId) ? sender.frameId as number : 0]
    },
    files: [PAGE_SCRIPT],
    world: "MAIN",
    injectImmediately: true
  });
  return { ok: true };
}

/** 저장된 설정이 없거나 오래된 형식이어도 현재 기본값을 빠짐없이 채웁니다. */
async function initializeSettings(): Promise<void> {
  const stored = await browser.storage.local.get("settings");
  await browser.storage.local.set({ settings: normalizeSettings(stored.settings) });
}

browser.runtime.onInstalled.addListener(() => {
  void initializeSettings();
});

/** 콘텐츠 화면에서 보낸 요청을 종류별로 나눠 처리합니다. */
browser.runtime.onMessage.addListener(async (message: unknown, sender) => {
  if (!isMessage(message)) return undefined;

  if (message.type === MESSAGE.injectWebsite) {
    try {
      return await injectPageScript(sender);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "페이지 스크립트 실행에 실패했습니다." };
    }
  }

  if (message.type === MESSAGE.captureTab) {
    // 영상 자체를 바로 읽으면 Safari 보안 오류가 날 수 있어 탭 전체를 먼저 캡처합니다.
    if (typeof browser.tabs?.captureVisibleTab !== "function") {
      throw new Error("Safari가 탭 캡처 API를 지원하지 않습니다.");
    }
    const options: browser.extensionTypes.ImageDetails = { format: "png" };
    const windowId = message.windowId;
    const dataUrl = typeof windowId === "number" && Number.isInteger(windowId)
      ? await browser.tabs.captureVisibleTab(windowId, options)
      : await browser.tabs.captureVisibleTab(options);
    return { dataUrl };
  }

  if (message.type === MESSAGE.liveDetail) {
    try {
      return await fetchLiveDetail(message.channelId || "");
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "방송 정보를 불러오지 못했습니다."
      };
    }
  }

  return undefined;
});
