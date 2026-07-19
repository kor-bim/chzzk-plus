import { isVodRoute } from "../../shared/chzzk-route";

/** 치지직 다시보기 주소에서 영상마다 변하지 않는 숫자 ID를 꺼냅니다. */
export function readVodId(pathname = location.pathname): string | null {
  return isVodRoute(pathname) ? pathname.match(/^\/video\/(\d+)/)?.[1] ?? null : null;
}
