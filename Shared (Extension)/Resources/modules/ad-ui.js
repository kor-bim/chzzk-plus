(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;

  CP.modules.AdUi = class AdUi {
    constructor() {
      this.lastScan = 0;
    }

    scan() {
      if (!CP.settings.enabled || performance.now() - this.lastScan < 500) return;
      this.lastScan = performance.now();
      if (CP.settings.autoAdSkip) this.clickSkipButtons();
      if (CP.settings.adPopupRemoval) this.removeDetectionPopups();
    }

    clickSkipButtons() {
      document.querySelectorAll("button, [role=button]").forEach((button) => {
        if (button.dataset.chzzkPlusAdSkip) return;
        const label = `${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`.trim();
        if (!/광고\s*(건너뛰기|스킵)|skip\s*ad/i.test(label)) return;
        button.dataset.chzzkPlusAdSkip = "true";
        button.click();
        CP.Toast.show("광고를 건너뛰었습니다.");
      });
    }

    update() {
      document.documentElement.classList.toggle("chzzk-plus-hide-ads",
        Boolean(CP.settings.enabled && CP.settings.networkAdBlock));
    }

    removeDetectionPopups() {
      const selector = '[role="dialog"], [class*="popup_container"], [class*="_modal_"], [class*="_popup_"]';
      document.querySelectorAll(selector).forEach((popup) => {
        if (popup.dataset.chzzkPlusAdPopup || !/광고\s*차단\s*프로그램.*사용\s*중/i.test(popup.textContent || "")) return;
        popup.dataset.chzzkPlusAdPopup = "true";
        const close = Array.from(popup.querySelectorAll("button, [role=button]")).find((button) =>
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
  };
})();
