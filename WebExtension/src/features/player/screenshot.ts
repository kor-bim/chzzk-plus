import { CP } from "../../runtime/extension-runtime";
import { MESSAGE } from "../../shared/messages";

/**
 * 현재 Safari 탭을 캡처한 뒤 플레이어 영상 부분만 PNG로 저장합니다.
 *
 * 영상 요소를 바로 이미지로 바꾸는 방식은 다른 서버에서 받은 영상 때문에 Safari가
 * 보안 오류를 낼 수 있습니다. 그래서 Safari가 허용한 '현재 탭 캡처'를 사용하고,
 * 화면에서 영상이 차지하는 위치를 계산해 필요한 부분만 잘라 냅니다.
 */
export class Screenshot {
    /**
     * 치지직 플레이어가 현재 사용 중인 버튼의 공통 모양만 가져옵니다.
     *
     * 설정 버튼 자체를 복제하면 치지직의 클릭 처리기가 카메라 버튼까지 설정
     * 버튼으로 오인할 수 있습니다. 따라서 크기·호버를 담당하는 공통 클래스만
     * 복사하고, `setting`, `fullscreen`처럼 기능을 뜻하는 클래스는 제외합니다.
     */
    private nativeButtonClasses(reference: HTMLButtonElement | null): string {
      // `pzp-setting-button`, `pzp-pc-setting-button`은 실제 설정 창을 여는 기능
      // 클래스라 제외합니다. 반면 `pzp-pc__setting-button`은 클립·상점 버튼도 함께
      // 사용하는 배치·표시 상태 클래스이므로 유지해야 네이티브 컨트롤과 같이 숨습니다.
      const settingActionClasses = new Set(["pzp-setting-button", "pzp-pc-setting-button"]);
      const classes = reference
        ? Array.from(reference.classList).filter((className) => !settingActionClasses.has(className))
        : [];
      if (!classes.includes("pzp-button")) classes.unshift("pzp-button");
      if (!classes.some((className) => className.includes("ui-button"))) classes.push("pzp-pc-ui-button");
      return classes.join(" ");
    }

    /** 주변 버튼에서 툴팁·아이콘 껍데기를 찾아 같은 DOM 구조를 만듭니다. */
    private createNativeButton(reference: HTMLButtonElement | null): HTMLButtonElement {
      const button = document.createElement("button");
      button.id = "chzzk-plus-screenshot-button";
      button.className = this.nativeButtonClasses(reference);
      button.type = "button";
      button.setAttribute("aria-label", "스크린샷");

      const referenceTooltip = reference?.querySelector<HTMLElement>("[class*=\"tooltip\"]");
      const referenceSvg = reference?.querySelector<SVGSVGElement>("svg");
      const referenceIcon = referenceSvg?.parentElement;
      const tooltipClass = referenceTooltip?.className || "pzp-button__tooltip pzp-button__tooltip--top";
      const iconClass = referenceIcon?.className || "pzp-ui-icon";
      const svgClass = referenceSvg?.getAttribute("class") || "pzp-ui-icon__svg";
      const width = referenceSvg?.getAttribute("width") || "36";
      const height = referenceSvg?.getAttribute("height") || "36";
      const viewBox = referenceSvg?.getAttribute("viewBox") || "0 0 36 36";

      button.innerHTML = `<span class="${tooltipClass}">스크린샷</span><span class="${iconClass}"><svg width="${width}" height="${height}" viewBox="${viewBox}" fill="none" class="${svgClass}" aria-hidden="true"><path d="M13 12.5 14.4 10h7.2l1.4 2.5h3a2 2 0 0 1 2 2V25a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V14.5a2 2 0 0 1 2-2h3Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="19.5" r="4" stroke="currentColor" stroke-width="1.7"/></svg></span>`;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Safari가 마우스 클릭 포커스를 유지하면서 별도 강조 테두리를 남기지 않게 합니다.
        button.blur();
        void this.capture();
      });
      return button;
    }

    readonly id = "screenshot";
    private readonly onKeyDown = (event: KeyboardEvent): void => {
      if (!CP.settings.enabled || !CP.settings.screenshotEnabled) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.capture();
      }
    };

    /** 스크린샷 단축키를 연결합니다. */
    start(): void {
      document.addEventListener("keydown", this.onKeyDown, true);
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
        const response = await browser.runtime.sendMessage({ type: MESSAGE.captureTab }) as { dataUrl?: string };
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
      const settingButton = controls.querySelector(CP.SELECTORS.settingButton);
      const reference = settingButton instanceof HTMLButtonElement
        ? settingButton
        : controls.querySelector<HTMLButtonElement>("button");
      const button = this.createNativeButton(reference);
      const target = settingButton?.parentElement || controls;
      target.insertBefore(button, settingButton || null);
    }

    update() {
      if (!CP.settings.enabled || !CP.settings.screenshotEnabled) {
        document.querySelector("#chzzk-plus-screenshot-button")?.remove();
      }
    }

    /** 기능을 끌 때 단축키와 버튼을 정리합니다. */
    stop(): void {
      document.removeEventListener("keydown", this.onKeyDown, true);
      document.querySelector("#chzzk-plus-screenshot-button")?.remove();
    }
  }
