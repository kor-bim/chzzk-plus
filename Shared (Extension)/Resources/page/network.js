(() => {
  "use strict";
  if (window.__chzzkPlusNetworkInstalled) return;
  Object.defineProperty(window, "__chzzkPlusNetworkInstalled", { value: true });

  let settings = { enabled: false, networkAdBlock: true };
  let lastSettingsKey = "";
  const nativeFetch = window.fetch;
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeJsonParse = JSON.parse;
  const pendingTextRoutes = new Map();
  const lastNoticeAt = new Map();
  const isEnabled = () => settings.enabled !== false && settings.networkAdBlock !== false;

  const notifyBlocked = (route, url) => {
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

  const routes = [
    {
      key: "ad-polling",
      label: "광고 폴링 차단",
      action: "stub",
      match: (url) => url.includes("api.chzzk.naver.com/ad-polling/"),
      body: { code: 200, message: null, content: {} }
    },
    {
      key: "veta",
      label: "Veta 광고 요청 차단",
      action: "stub",
      match: (url) => /(?:^|\.)veta\.naver\.com\/(?:vas|gfp|call)(?:\/|\?|$)/i.test(url),
      body: {}
    },
    {
      key: "service-t",
      label: "영상 광고 일정 제거",
      action: "rewrite",
      match: (url) => url.includes("api.chzzk.naver.com/service/t/")
    },
    {
      key: "display-status",
      label: "프리롤·미드롤 차단",
      action: "rewrite",
      match: (url) => url.includes("/ad/display-status")
    },
    {
      key: "my-info",
      label: "광고 미노출 상태 적용",
      action: "rewrite",
      match: (url) => /api\.chzzk\.naver\.com\/service\/[^/]+\/channels\/[^/]+\/my-info(?:\?|$)/i.test(url)
    }
  ];

  const findRoute = (url) => routes.find((route) => route.match(url)) || null;
  const extractUrl = (input) => typeof input === "string"
    ? input
    : input instanceof URL ? input.href : input?.url || "";

  const mutatePayload = (payload, route) => {
    if (!payload || typeof payload !== "object" || !route) return false;
    const content = payload.content;
    if (!content || typeof content !== "object") return false;
    let changed = false;

    if (route.key === "service-t") {
      if (Object.prototype.hasOwnProperty.call(content, "videoAdScheduleId")) {
        delete content.videoAdScheduleId;
        changed = true;
      }
      if (Array.isArray(content.adBreaks) && content.adBreaks.length) {
        content.adBreaks = [];
        changed = true;
      }
      if (Array.isArray(content.ads) && content.ads.length) {
        content.ads = [];
        changed = true;
      }
    }

    if (route.key === "display-status") {
      const response = content.playerAdDisplayResponse;
      if (response && typeof response === "object") {
        if (response.preRoll !== false) { response.preRoll = false; changed = true; }
        if (response.midRoll !== false) { response.midRoll = false; changed = true; }
      }
    }

    if (route.key === "my-info" && content.adFree !== true) {
      content.adFree = true;
      changed = true;
    }
    return changed;
  };

  const rememberTextRoute = (text, route, url) => {
    if (!text || typeof text !== "string") return;
    pendingTextRoutes.set(text, { route, url });
    while (pendingTextRoutes.size > 12) pendingTextRoutes.delete(pendingTextRoutes.keys().next().value);
  };

  JSON.parse = new Proxy(nativeJsonParse, {
    apply(target, thisArg, args) {
      const value = Reflect.apply(target, thisArg, args);
      if (!pendingTextRoutes.size) return value;
      const text = typeof args[0] === "string" ? args[0] : null;
      const pending = text ? pendingTextRoutes.get(text) : null;
      if (pending) {
        pendingTextRoutes.delete(text);
        if (isEnabled() && mutatePayload(value, pending.route)) notifyBlocked(pending.route, pending.url);
      }
      return value;
    }
  });

  const makeStubUrl = (body) => {
    try {
      return URL.createObjectURL(new Blob([JSON.stringify(body)], { type: "application/json" }));
    } catch (_) {
      return null;
    }
  };
  const stubUrls = new Map(routes.filter((route) => route.action === "stub").map((route) => [route.key, makeStubUrl(route.body)]));

  XMLHttpRequest.prototype.open = new Proxy(nativeOpen, {
    apply(target, xhr, args) {
      if (!isEnabled()) return Reflect.apply(target, xhr, args);
      const url = extractUrl(args[1]);
      const route = findRoute(url);

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
            if (mutatePayload(response, route)) notifyBlocked(route, url);
          } else {
            rememberTextRoute(xhr.responseText, route, url);
          }
        } catch (_) {}
      };
      xhr.addEventListener("readystatechange", onReadyStateChange);
      return result;
    }
  });

  const makeJsonResponse = (body, sourceResponse = null) => {
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
      try { Object.defineProperty(response, "url", { value: sourceResponse.url }); } catch (_) {}
    }
    return response;
  };

  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      if (!isEnabled()) return Reflect.apply(target, thisArg, args);
      const url = extractUrl(args[0]);
      const route = findRoute(url);
      if (!route) return Reflect.apply(target, thisArg, args);

      if (route.action === "stub") {
        notifyBlocked(route, url);
        return Promise.resolve(makeJsonResponse(route.body));
      }

      return Reflect.apply(target, thisArg, args).then(async (response) => {
        try {
          const payload = await response.clone().json();
          if (!mutatePayload(payload, route)) return response;
          notifyBlocked(route, url);
          return makeJsonResponse(payload, response);
        } catch (_) {
          return response;
        }
      });
    }
  });

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
})();
