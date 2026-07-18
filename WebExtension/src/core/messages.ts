import type { Settings } from "./settings";

/**
 * 확장 프로그램의 서로 다른 실행 구역이 주고받을 수 있는 요청 목록입니다.
 * 문자열을 아무렇게나 보내지 않고 가능한 요청 모양을 한곳에 적어 오타와 누락을
 * 발견하기 쉽게 합니다.
 */
export type ExtensionMessage =
  | { type: "INJECT_PAGE_SCRIPT" }
  | { type: "GET_DEFAULT_SETTINGS" }
  | { type: "CAPTURE_VISIBLE_TAB"; windowId?: number }
  | { type: "CHZZK_PLUS_SETTINGS"; settings: Settings }
  | { type: "CHZZK_PLUS_CAPTURE" }
  | { type: "CHZZK_PLUS_GET_STATUS" };

export type ContentToPageMessage =
  | { source: "chzzk-plus-content"; type: "SETTINGS"; settings: Settings }
  | { source: "chzzk-plus-content"; type: "PLAYER_COMMAND"; command: "SEEK" | "GO_LIVE"; target?: number };
