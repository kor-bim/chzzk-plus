import { AD_ROUTES, findAdRoute, type AdRoute } from "./request-routes";
import { removeAdsFromResponse } from "./response-editor";

declare global {
  interface Window { __chzzkPlusNetworkInstalled?: boolean; }
}

export function installAdBlockRequestInterceptor(): void {
  "use strict";
  /**
   * 치지직이 광고 정보를 받아 오는 통신을 찾아 안전한 빈 결과로 바꾸는 파일입니다.
   *
   * 브라우저의 광고 주소를 무조건 막으면 치지직 코드가 '통신 실패'로 판단해 영상
   * 재생까지 멈출 수 있습니다. 그래서 요청 종류에 따라 다음 두 방법을 사용합니다.
   *
   * - 광고 전용 요청: 성공했지만 광고가 없다는 빈 결과를 돌려줍니다.
   * - 방송 정보 요청: 정상 방송 정보는 유지하고 광고 관련 값만 제거합니다.
   *
   * 설정을 끄면 원래 통신 함수를 그대로 호출하므로 페이지를 새로고침하지 않아도
   * 즉시 원래 동작으로 돌아갑니다.
   */
  if (window.__chzzkPlusNetworkInstalled) return;
  Object.defineProperty(window, "__chzzkPlusNetworkInstalled", { value: true });

  let settings = { enabled: false, networkAdBlock: true };
  let lastSettingsKey = "";
  // 아래에서 통신 함수를 감싸기 전에 원래 Safari 함수를 보관합니다.
  const nativeFetch = window.fetch;
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeJsonParse = JSON.parse;
  const pendingTextRoutes = new Map<string, { route: AdRoute; url: string }>();
  const lastNoticeAt = new Map<string, number>();
  const isEnabled = () => settings.enabled !== false && settings.networkAdBlock !== false;

  /** 같은 종류의 광고 처리 알림을 1.5초에 한 번만 화면 기능에 전달합니다. */
  const notifyBlocked = (route: AdRoute, url: string): void => {
    const now = Date.now();
    const previous = lastNoticeAt.get(route.key) || 0;
    if (now - previous < 1500) return;
    lastNoticeAt.set(route.key, now);
    window.postMessage({
      source: "chzzk-plus-main",
      type: "AD_BLOCKED",
      label: route.label,
      url
    }, "*");
  };

  /** 주소 문자열, URL 객체, Request 객체 중 어떤 형태가 와도 주소 문자열로 바꿉니다. */
  const extractUrl = (input: RequestInfo | URL | undefined): string => typeof input === "string"
    ? input
    : input instanceof URL ? input.href : input?.url || "";

  /** 문자열로 받은 응답이 나중에 JSON으로 바뀔 때 어떤 요청이었는지 잠시 기억합니다. */
  const rememberTextRoute = (text: unknown, route: AdRoute, url: string): void => {
    if (!text || typeof text !== "string") return;
    pendingTextRoutes.set(text, { route, url });
    while (pendingTextRoutes.size > 12) {
      const oldest = pendingTextRoutes.keys().next().value;
      if (oldest) pendingTextRoutes.delete(oldest);
    }
  };

  // 일부 치지직 통신은 응답을 문자열로 받은 뒤 나중에 JSON으로 바꿉니다. 이 순간을
  // 확인해야 광고 값만 수정할 수 있으므로 원래 JSON.parse 앞뒤에 작은 처리를 덧붙입니다.
  JSON.parse = new Proxy(nativeJsonParse, {
    apply(target, thisArg, args) {
      const value = Reflect.apply(target, thisArg, args);
      if (!pendingTextRoutes.size) return value;
      const text = typeof args[0] === "string" ? args[0] : null;
      const pending = text ? pendingTextRoutes.get(text) : null;
      if (text && pending) {
        pendingTextRoutes.delete(text);
        if (isEnabled() && removeAdsFromResponse(value, pending.route)) notifyBlocked(pending.route, pending.url);
      }
      return value;
    }
  });

  /** XHR이 읽을 수 있는 임시 주소에 빈 성공 결과를 담습니다. */
  const makeStubUrl = (body: Record<string, unknown>): string | null => {
    try {
      return URL.createObjectURL(new Blob([JSON.stringify(body)], { type: "application/json" }));
    } catch {
      return null;
    }
  };
  const stubUrls = new Map(AD_ROUTES
    .filter((route) => route.action === "stub")
    .map((route) => [route.key, makeStubUrl(route.body ?? {})]));

  // 치지직이 오래된 XMLHttpRequest 방식으로 요청할 때 주소를 확인합니다.
  XMLHttpRequest.prototype.open = new Proxy(nativeOpen, {
    apply(target, xhr, args) {
      if (!isEnabled()) return Reflect.apply(target, xhr, args);
      const url = extractUrl(args[1]);
      const route = findAdRoute(url);

      if (route?.action === "stub") {
        const stubUrl = stubUrls.get(route.key);
        if (stubUrl) {
          notifyBlocked(route, url);
          return Reflect.apply(target, xhr, ["GET", stubUrl, args.length > 2 ? args[2] : true]);
        }
      }

      const result = Reflect.apply(target, xhr, args);
      if (route?.action !== "rewrite") return result;

      const onReadyStateChange = () => {
        if (xhr.readyState !== 4) return;
        xhr.removeEventListener("readystatechange", onReadyStateChange);
        if (!isEnabled()) return;
        try {
          const response = xhr.response;
          if (response && typeof response === "object") {
            if (removeAdsFromResponse(response, route)) notifyBlocked(route, url);
          } else {
            rememberTextRoute(xhr.responseText, route, url);
          }
        } catch {
          // 응답 형식에 따라 글자 내용을 읽지 못하는 경우가 있습니다. 이때는 오류로
          // 재생을 방해하지 않고 치지직이 받은 원본 결과를 그대로 유지합니다.
        }
      };
      xhr.addEventListener("readystatechange", onReadyStateChange);
      return result;
    }
  });

  /** 수정한 JSON을 원래 응답의 상태와 머리글을 유지한 새 응답으로 포장합니다. */
  const makeJsonResponse = (body: Record<string, unknown>, sourceResponse: Response | null = null): Response => {
    const headers = new Headers(sourceResponse?.headers || { "Content-Type": "application/json; charset=utf-8" });
    headers.delete("content-length");
    headers.delete("content-encoding");
    if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
    const response = new Response(JSON.stringify(body), {
      status: sourceResponse?.status || 200,
      statusText: sourceResponse?.statusText || "OK",
      headers
    });
    if (sourceResponse?.url) {
      try {
        Object.defineProperty(response, "url", { value: sourceResponse.url });
      } catch {
        // Safari가 응답 주소 표시 변경을 허용하지 않아도 실제 내용 사용에는 문제가 없습니다.
      }
    }
    return response;
  };

  // 치지직이 최신 fetch 방식으로 요청할 때 광고 전용 요청은 빈 결과로 바꾸고,
  // 방송 정보 요청은 원본을 받은 뒤 광고 값만 제거합니다.
  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      if (!isEnabled()) return Reflect.apply(target, thisArg, args);
      const url = extractUrl(args[0]);
      const route = findAdRoute(url);
      if (!route) return Reflect.apply(target, thisArg, args);

      if (route.action === "stub") {
        notifyBlocked(route, url);
        return Promise.resolve(makeJsonResponse(route.body ?? {}));
      }

      return Reflect.apply(target, thisArg, args).then(async (response: Response) => {
        try {
          const payload = await response.clone().json();
          if (!removeAdsFromResponse(payload, route)) return response;
          notifyBlocked(route, url);
          return makeJsonResponse(payload, response);
        } catch {
          return response;
        }
      });
    }
  });

  // 팝업에서 광고 차단이나 전체 확장 기능을 끄면 저장된 대기 정보도 즉시 비웁니다.
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "chzzk-plus-content" || event.data.type !== "SETTINGS") return;
    const next = { ...settings, ...(event.data.settings || {}) };
    const key = `${next.enabled}:${next.networkAdBlock}`;
    if (key === lastSettingsKey) return;
    lastSettingsKey = key;
    settings = next;
    if (!isEnabled()) pendingTextRoutes.clear();
  });
  window.postMessage({ source: "chzzk-plus-main", type: "READY", module: "network" }, "*");
}
