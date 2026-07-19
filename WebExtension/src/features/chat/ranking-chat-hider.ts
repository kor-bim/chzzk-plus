import { CP } from "../../runtime/extension-runtime";

/**
 * 순위권으로 강조된 채팅 영역을 숨기는 기능입니다.
 * 채팅 항목을 하나씩 지우지 않고 문서 최상단에 표시용 이름 하나를 붙입니다.
 * 실제 숨김 모양은 `src/styles/chat/blinded-message.css`가 담당해 화면 변화 작업을 줄입니다.
 */
export class RankingChatHider {
    readonly id = "chat-style";
    /** 전체 확장 기능과 순위권 채팅 설정이 모두 켜졌을 때만 숨김 스타일을 적용합니다. */
    update() {
      document.documentElement.classList.toggle(
        "chzzk-plus-hide-ranking",
        Boolean(CP.settings.enabled && CP.settings.rankingHideEnabled)
      );
    }
  }
