export interface AdRoute {
  key: "ad-polling" | "veta" | "service-t" | "display-status" | "my-info";
  label: string;
  action: "stub" | "rewrite";
  match: (url: string) => boolean;
  body?: Record<string, unknown>;
}

function matchesHostAndPath(url: string, host: string, path: RegExp): boolean {
  try {
    const parsed = new URL(url, typeof location === "undefined" ? "https://chzzk.naver.com/" : location.href);
    return (parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)) && path.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** 광고 통신 주소와 처리 방법을 선언한 표입니다. 실제 통신 코드는 이 규칙만 읽습니다. */
export const AD_ROUTES: readonly AdRoute[] = [
  {
    key: "ad-polling", label: "광고 확인 요청 차단", action: "stub",
    match: (url) => url.includes("api.chzzk.naver.com/ad-polling/"),
    body: { code: 200, message: null, content: {} }
  },
  {
    key: "veta", label: "광고 요청 차단", action: "stub",
    match: (url) => matchesHostAndPath(url, "veta.naver.com", /^\/(?:vas|gfp|call)(?:\/|$)/i),
    body: {}
  },
  {
    key: "service-t", label: "영상 광고 일정 제거", action: "rewrite",
    match: (url) => url.includes("api.chzzk.naver.com/service/t/")
  },
  {
    key: "display-status", label: "영상 광고 표시 해제", action: "rewrite",
    match: (url) => url.includes("/ad/display-status")
  },
  {
    key: "my-info", label: "광고 미노출 상태 적용", action: "rewrite",
    match: (url) => /api\.chzzk\.naver\.com\/service\/[^/]+\/channels\/[^/]+\/my-info(?:\?|$)/i.test(url)
  }
];

export function findAdRoute(url: string): AdRoute | null {
  return AD_ROUTES.find((route) => route.match(url)) ?? null;
}
