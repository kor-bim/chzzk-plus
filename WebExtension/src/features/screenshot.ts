import { CP } from "../content/runtime";

/**
 * 현재 Safari 탭을 캡처한 뒤 플레이어 영상 부분만 PNG로 저장합니다.
 *
 * 영상 요소를 바로 이미지로 바꾸는 방식은 다른 서버에서 받은 영상 때문에 Safari가
 * 보안 오류를 낼 수 있습니다. 그래서 Safari가 허용한 '현재 탭 캡처'를 사용하고,
 * 화면에서 영상이 차지하는 위치를 계산해 필요한 부분만 잘라 냅니다.
 */
export class Screenshot {
    readonly id = "screenshot";
    private readonly onKeyDown = (event: KeyboardEvent): void => {
      if (!CP.settings.enabled || !CP.settings.screenshotEnabled) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.capture();
      }
    };

    /** 단축키와 팝업에서 호출할 촬영 동작을 연결합니다. */
    start(): void {
      document.addEventListener("keydown", this.onKeyDown, true);
      CP.actions.captureScreenshot = () => void this.capture();
    }

    /** 영상 위치, 화면 배율, 실제 이미지 크기를 계산해 PNG 다운로드를 시작합니다. */
    async capture(): Promise<void> {
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
        const response = await browser.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }) as { dataUrl?: string };
        if (!response?.dataUrl) throw new Error("탭 캡처 결과가 비어 있습니다.");

        const screenshot = new Image();
        screenshot.src = response.dataUrl;
        await screenshot.decode();
        // Retina 화면이나 Safari 확대 상태에서는 화면의 CSS 크기와 캡처 이미지의
        // 픽셀 수가 다르므로 가로·세로 비율을 따로 계산합니다.
        const scaleX = screenshot.naturalWidth / window.innerWidth;
        const scaleY = screenshot.naturalHeight / window.innerHeight;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((right - left) * scaleX));
        canvas.height = Math.max(1, Math.round((bottom - top) * scaleY));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("스크린샷 캔버스를 생성하지 못했습니다.");
        context.drawImage(
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

    /** 플레이어 오른쪽 버튼 영역이 새로 생겼을 때 카메라 버튼을 한 번만 추가합니다. */
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
        void this.capture();
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

    /** 기능을 끌 때 단축키, 버튼과 외부 호출 동작을 정리합니다. */
    stop(): void {
      document.removeEventListener("keydown", this.onKeyDown, true);
      document.querySelector("#chzzk-plus-screenshot-button")?.remove();
      delete CP.actions.captureScreenshot;
    }
  }
