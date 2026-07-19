import { describe, expect, it } from "vitest";
import { AD_ROUTES, findAdRoute } from "../src/features/ad-block/request-routes";
import { removeAdsFromResponse } from "../src/features/ad-block/response-editor";

describe("removeAdsFromResponse", () => {
  it("matches full Veta URLs instead of only bare host strings", () => {
    expect(findAdRoute("https://veta.naver.com/vas/live?id=1")?.key).toBe("veta");
  });
  it("keeps stream data and removes only ad schedules", () => {
    const route = AD_ROUTES.find((item) => item.key === "service-t")!;
    const payload = { content: { title: "방송", videoAdScheduleId: "ad", adBreaks: [1], ads: [2] } };

    expect(removeAdsFromResponse(payload, route)).toBe(true);
    expect(payload.content).toEqual({ title: "방송", adBreaks: [], ads: [] });
  });

  it("does not report a change when no ad field exists", () => {
    const route = AD_ROUTES.find((item) => item.key === "service-t")!;
    expect(removeAdsFromResponse({ content: { title: "방송" } }, route)).toBe(false);
  });
});
