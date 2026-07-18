import { CP } from "../content/runtime";

/**
 * 사용자의 화면에 이미 나타난 광고 관련 버튼과 안내창을 처리합니다.
 * 광고 요청 자체를 다루는 코드는 `page/network.ts`에 있고, 이 파일은 화면에 남은
 * 건너뛰기 버튼을 누르거나 광고 차단 안내창을 닫는 마무리 작업만 담당합니다.
 */
export class AdUi {
    readonly id = "ad-ui";
    private lastScan = 0;

    constructor() {
    }

    /** 치지직 화면이 바뀔 때 최대 0.5초에 한 번만 광고 화면을 확인합니다. */
    scan() {
      if (!CP.settings.enabled || performance.now() - this.lastScan < 500) return;
      this.lastScan = performance.now();
      if (CP.settings.autoAdSkip) this.clickSkipButtons();
      if (CP.settings.adPopupRemoval) this.removeDetectionPopups();
    }

    /** 버튼의 글자와 접근성 이름에서 '광고 건너뛰기'를 찾아 한 번만 누릅니다. */
    clickSkipButtons() {
      document.querySelectorAll<HTMLElement>("button, [role=button]").forEach((button) => {
        if (button.dataset.chzzkPlusAdSkip) return;
        const label = `${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`.trim();
        if (!/광고\s*(건너뛰기|스킵)|skip\s*ad/i.test(label)) return;
        button.dataset.chzzkPlusAdSkip = "true";
        button.click();
        CP.Toast.show("광고를 건너뛰었습니다.");
      });
    }

    /** 광고 차단 설정에 따라 CSS로 숨길 광고 영역의 상태를 바꿉니다. */
    update() {
      document.documentElement.classList.toggle("chzzk-plus-hide-ads",
        Boolean(CP.settings.enabled && CP.settings.networkAdBlock));
    }

    /** 광고 차단 프로그램 사용 안내창을 닫고, 안내창이 막은 페이지 스크롤도 복원합니다. */
    removeDetectionPopups() {
      const selector = '[role="dialog"], [class*="popup_container"], [class*="_modal_"], [class*="_popup_"]';
      document.querySelectorAll<HTMLElement>(selector).forEach((popup) => {
        if (popup.dataset.chzzkPlusAdPopup || !/광고\s*차단\s*프로그램.*사용\s*중/i.test(popup.textContent || "")) return;
        popup.dataset.chzzkPlusAdPopup = "true";
        const close = Array.from(popup.querySelectorAll<HTMLElement>("button, [role=button]")).find((button) =>
          /확인|닫기|close/i.test(`${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`));
        close?.click();
        popup.style.setProperty("display", "none", "important");
        for (const root of [document.documentElement, document.body]) {
          root.style.removeProperty("overflow");
          root.style.removeProperty("position");
          root.style.removeProperty("touch-action");
        }
      });
    }
  }
