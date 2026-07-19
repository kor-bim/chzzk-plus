import type { AdRoute } from "./request-routes";

type JsonObject = Record<string, any>;

/** 방송 정보는 보존하고 응답 안의 광고 일정·표시 여부만 수정합니다. */
export function removeAdsFromResponse(payload: JsonObject, route: AdRoute): boolean {
  if (!payload || typeof payload !== "object") return false;
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
}
