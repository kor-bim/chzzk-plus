(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;

  CP.modules.Screenshot = class Screenshot {
    constructor() {
      document.addEventListener("keydown", (event) => {
        if (!CP.settings.enabled || !CP.settings.screenshotEnabled) return;
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
          event.preventDefault();
          this.capture();
        }
      }, true);
      CP.actions.captureScreenshot = () => this.capture();
    }

    async capture() {
      if (!CP.settings.enabled || !CP.settings.screenshotEnabled) return;
      const video = CP.findVideo();
      if (!video || video.readyState < 2 || !video.videoWidth) {
        CP.Debug.error("Screenshot", "캡처 가능한 영상이 없음", { readyState: video?.readyState, videoWidth: video?.videoWidth });
        return;
      }
      const rect = video.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(window.innerWidth, rect.right);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) {
        CP.Debug.error("Screenshot", "영상이 현재 화면 밖에 있어 캡처할 수 없음", { left, top, right, bottom });
        return;
      }

      document.documentElement.classList.add("chzzk-plus-capturing");
      try {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const response = await browser.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" });
        if (!response?.dataUrl) throw new Error("탭 캡처 결과가 비어 있습니다.");

        const screenshot = new Image();
        screenshot.src = response.dataUrl;
        await screenshot.decode();
        const scaleX = screenshot.naturalWidth / window.innerWidth;
        const scaleY = screenshot.naturalHeight / window.innerHeight;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((right - left) * scaleX));
        canvas.height = Math.max(1, Math.round((bottom - top) * scaleY));
        canvas.getContext("2d", { alpha: false }).drawImage(
          screenshot,
          Math.round(left * scaleX),
          Math.round(top * scaleY),
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height
        );
        const anchor = document.createElement("a");
        anchor.hidden = true;
        anchor.href = canvas.toDataURL("image/png");
        anchor.download = `chzzk-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        CP.Toast.show("스크린샷을 저장했습니다.");
      } catch (error) {
        CP.Debug.error("Screenshot", "스크린샷 실패", error);
      } finally {
        document.documentElement.classList.remove("chzzk-plus-capturing");
      }
    }

    scan() {
      if (!CP.settings.enabled || !CP.settings.screenshotEnabled) return;
      const controls = document.querySelector(CP.SELECTORS.rightControls);
      if (!controls || controls.querySelector("#chzzk-plus-screenshot-button")) return;
      const button = document.createElement("button");
      button.id = "chzzk-plus-screenshot-button";
      button.className = "pzp-button pzp-pc-ui-button";
      button.type = "button";
      button.setAttribute("aria-label", "스크린샷");
      button.innerHTML = `<span class="pzp-button__tooltip pzp-button__tooltip--top">스크린샷</span><span class="pzp-ui-icon"><svg width="36" height="36" viewBox="0 0 36 36" fill="none" class="pzp-ui-icon__svg"><rect x="8" y="12" width="20" height="14" rx="2" stroke="white" stroke-width="1.7"/><circle cx="18" cy="19" r="4" stroke="white" stroke-width="1.7"/><circle cx="18" cy="19" r="1.5" fill="white"/><rect x="13" y="10" width="10" height="3" rx="1" fill="white" opacity=".6"/></svg></span>`;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.capture();
      });
      const settingButton = controls.querySelector(CP.SELECTORS.settingButton);
      const target = settingButton?.parentElement || controls;
      target.insertBefore(button, settingButton || null);
    }

    update() {
      if (!CP.settings.enabled || !CP.settings.screenshotEnabled) {
        document.querySelector("#chzzk-plus-screenshot-button")?.remove();
      }
    }
  };
})();
