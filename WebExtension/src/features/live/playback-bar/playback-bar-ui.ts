import { CP, type PlaybackState } from "../../../runtime/extension-runtime";
import { sendPlaybackCommand } from "./playback-controller";
import { LIVE_EPSILON, formatBehind, type PlaybackControls, type StoredDisplay } from "./playback-state";

/**
 * 치지직 기본 재생 진행 막대를 숨기고 라이브 되돌려 보기 막대로 교체합니다.
 *
 * 이 파일은 사용자가 보는 막대와 입력만 담당합니다. 실제 영상 위치 변경은 보안상
 * 분리된 플레이어 사이트 내부 제어 코드가 담당하며, 클릭한 시간을 메시지로 전달합니다. 방송이
 * 되돌려 보기를 제공하지 않으면 억지로 이동시키지 않고 LIVE 상태로 표시합니다.
 */
export class PlaybackBar {
    readonly id = "playback-bar";
    private root: HTMLElement | null = null;
    private bottom: Element | null = null;
    private state: PlaybackState | null = null;
    private readonly hiddenNative = new Map<HTMLElement, StoredDisplay>();
    private controls: PlaybackControls | null = null;
    private renderFrame = 0;
    private dragging = false;
    private lastPointerX: number | null = null;
    private readonly onDocumentMove = (event: MouseEvent): void => this.drag(event);
    private readonly onDocumentUp = (event: MouseEvent): void => this.endDrag(event);
    private readonly onDocumentKeyDown = (event: KeyboardEvent): void => this.handleGlobalKey(event);

    /** 사이트 내부 플레이어 제어 코드가 보낸 재생 위치를 받을 함수를 연결합니다. */
    start(): void {
      CP.actions.updatePlaybackState = (state) => this.receiveState(state);
      document.addEventListener("keydown", this.onDocumentKeyDown, true);
    }

    /** 전체 설정, 재생바 설정, 라이브 방송 주소를 모두 만족할 때만 동작합니다. */
    private enabled(): boolean {
      return CP.settings.enabled && CP.settings.playbackBarEnabled && /^\/live\//.test(location.pathname);
    }

    /** 영상의 현재 위치와 되돌릴 수 있는 범위를 받아 다음 화면 그리기를 예약합니다. */
    private receiveState(state: PlaybackState): void {
      // 드래그 중에는 0.25초마다 도착하는 실제 위치가 사용자의 손잡이를 되돌리지 않게
      // 범위 정보만 새로 받고, 마우스로 고른 임시 위치는 유지합니다.
      this.state = this.dragging && this.state
        ? { ...state, currentTime: this.state.currentTime, atLive: this.state.atLive }
        : state;
      if (this.enabled()) {
        if (!this.root?.isConnected) this.scan();
        this.requestRender();
      }
    }

    /** 치지직 플레이어에서 기본 진행 막대가 들어 있는 아래쪽 영역을 찾습니다. */
    private findBottom(video: HTMLVideoElement | null): Element | null {
      const player = video?.closest(".pzp-pc, .pzp") || document.querySelector(".pzp-pc, .pzp");
      return player?.querySelector(".pzp-pc__bottom, .pzp-pc-bottom")
        || document.querySelector(".pzp-pc__bottom, .pzp-pc-bottom");
    }

    /** 기존 진행 막대의 원래 display 값을 보관한 뒤 화면에서만 숨깁니다. */
    private hideNative(bottom: Element): void {
      const elements = new Set(bottom.querySelectorAll<HTMLElement>(":scope > .pzp-pc-progress-slider, :scope > [class*=\"slider_wrap__\"]"));
      const legacySlider = bottom.querySelector<HTMLElement>(":scope > .slider") || bottom.querySelector<HTMLElement>(".slider");
      if (legacySlider) elements.add(legacySlider);
      elements.forEach((element) => {
        if (!(element instanceof HTMLElement) || element.closest("#chzzk-plus-playback-bar")) return;
        if (!this.hiddenNative.has(element)) {
          this.hiddenNative.set(element, {
            display: element.style.getPropertyValue("display"),
            priority: element.style.getPropertyPriority("display")
          });
        }
        element.style.setProperty("display", "none", "important");
      });
    }

    /** 확장 기능을 끌 때 기존 진행 막대의 원래 표시 상태를 정확히 되돌립니다. */
    private restoreNative(): void {
      this.hiddenNative.forEach((style, element) => {
        if (!element.isConnected) return;
        if (style.display) element.style.setProperty("display", style.display, style.priority);
        else element.style.removeProperty("display");
      });
      this.hiddenNative.clear();
    }

    /** 새 치지직 플레이어 아래쪽에 재생바 HTML과 마우스·키보드 입력을 연결합니다. */
    private mount(bottom: Element): void {
      this.destroy();
      this.bottom = bottom;
      // 치지직이 마우스 상태에 따라 진행바 opacity를 바꾸는 현재 클래스 전체를
      // 그대로 물려받습니다. 이름을 고정하면 사이트 업데이트 때 다시 어긋날 수 있습니다.
      const nativeProgress = bottom.querySelector<HTMLElement>(":scope > .pzp-pc-progress-slider, :scope > [class*=\"slider_wrap__\"], :scope > .slider");
      const nativeClasses = nativeProgress?.className
        || "pzp-pc-progress-slider pzp-pc__progress-slider pzp-ui-slider pzp-progress-slider pzp-ui-slider--pc";
      this.hideNative(bottom);

      const root = document.createElement("div");
      root.id = "chzzk-plus-playback-bar";
      root.className = nativeClasses;
      root.innerHTML = `
        <div class="live-bar-ui">
          <div class="slide-box" role="slider" aria-label="라이브 재생 위치, 좌우 방향키로 5초 이동" aria-valuemin="0" aria-valuemax="100" tabindex="0">
            <div class="track"></div>
            <div class="rng"><span class="thumb"></span></div>
            <span class="live-edge" aria-hidden="true"></span>
            <div class="hover-x"></div>
            <div class="hover-tip">LIVE</div>
          </div>
          <div class="time">
            <span class="position" hidden>15초 전</span>
            <button class="go live" type="button" title="실시간으로 이동 (End)"><i aria-hidden="true"></i><span>LIVE</span></button>
          </div>
        </div>`;
      bottom.appendChild(root);
      this.root = root;

      const slide = root.querySelector<HTMLElement>(".slide-box");
      const progress = root.querySelector<HTMLElement>(".rng");
      const thumb = root.querySelector<HTMLElement>(".thumb");
      const position = root.querySelector<HTMLElement>(".position");
      const button = root.querySelector<HTMLButtonElement>(".go");
      const tip = root.querySelector<HTMLElement>(".hover-tip");
      const line = root.querySelector<HTMLElement>(".hover-x");
      if (!slide || !progress || !thumb || !position || !button || !tip || !line) return;
      this.controls = {
        slide,
        progress,
        thumb,
        position,
        button,
        tip,
        line
      };
      slide.addEventListener("mousedown", (event) => this.beginDrag(event));
      slide.addEventListener("pointerenter", (event) => this.showPreview(event));
      slide.addEventListener("pointermove", (event) => this.showPreview(event));
      slide.addEventListener("pointerleave", () => this.hidePreview());
      slide.addEventListener("keydown", (event) => this.handleKey(event));
      this.controls.button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.command("GO_LIVE");
      });

      this.requestRender();
    }

    /** 방송 전환으로 플레이어가 교체됐는지 확인하고 필요할 때만 재생바를 다시 만듭니다. */
    scan(): void {
      if (!this.enabled()) {
        this.destroy();
        return;
      }
      const video = CP.findVideo();
      const bottom = this.findBottom(video);
      if (!video || !bottom) return;
      if (!this.root?.isConnected || this.bottom !== bottom) this.mount(bottom);
      else this.hideNative(bottom);
    }

    update(): void {
      this.scan();
    }

    /** 드래그 이벤트, 예약된 화면 그리기, 커스텀 막대를 제거하고 기본 막대를 복원합니다. */
    private destroy(): void {
      document.removeEventListener("mousemove", this.onDocumentMove, true);
      document.removeEventListener("mouseup", this.onDocumentUp, true);
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = 0;
      this.dragging = false;
      this.root?.remove();
      this.root = null;
      this.controls = null;
      this.bottom = null;
      this.restoreNative();
    }

    /** 실제 영상을 움직이는 사이트 내부 코드에 '시간 이동' 또는 'LIVE 복귀'를 요청합니다. */
    private command(command: "SEEK" | "GO_LIVE", target?: number): void {
      sendPlaybackCommand(command, target);
    }

    /** 마우스의 화면 좌표를 재생바 안쪽 위치와 0~1 비율로 바꿉니다. */
    private positionFor(clientX: number): { x: number; ratio: number } | null {
      const slide = this.controls?.slide;
      const rect = slide?.getBoundingClientRect();
      if (!rect?.width) return null;
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      return { x, ratio: x / rect.width };
    }

    /** 마우스 위치가 실제 영상의 몇 초를 뜻하는지 계산합니다. */
    private targetFor(clientX: number): number | null {
      const position = this.positionFor(clientX);
      if (!position || !this.state?.seekable || this.state.end <= this.state.start) return null;
      return this.state.start + position.ratio * (this.state.end - this.state.start);
    }

    /** 마우스를 누른 즉시 미리 위치를 표시하고 드래그 추적을 시작합니다. */
    private beginDrag(event: MouseEvent): void {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.dragging = true;
      this.root?.classList.add("no-anim");
      this.lastPointerX = event.clientX;
      const target = this.targetFor(event.clientX);
      const state = this.state;
      if (target != null && state) {
        this.state = { ...state, currentTime: target, atLive: state.end - target < LIVE_EPSILON };
        this.requestRender();
      }
      document.addEventListener("mousemove", this.onDocumentMove, true);
      document.addEventListener("mouseup", this.onDocumentUp, true);
    }

    /** 드래그 중에는 영상 명령을 계속 보내지 않고 화면 표시만 가볍게 바꿉니다. */
    private drag(event: MouseEvent): void {
      if (!this.dragging) return;
      event.preventDefault();
      this.lastPointerX = event.clientX;
      const target = this.targetFor(event.clientX);
      const state = this.state;
      if (target == null || !state) return;
      this.state = { ...state, currentTime: target, atLive: state.end - target < LIVE_EPSILON };
      this.requestRender();
      this.showPreview(event);
    }

    /** 마우스를 놓은 마지막 위치로 한 번만 실제 영상 이동을 요청합니다. */
    private endDrag(event: MouseEvent): void {
      if (!this.dragging) return;
      event.preventDefault();
      event.stopPropagation();
      const target = this.targetFor(event.clientX);
      if (target != null && this.state) this.command(this.state.end - target < LIVE_EPSILON ? "GO_LIVE" : "SEEK", target);
      this.dragging = false;
      this.root?.classList.remove("no-anim");
      document.removeEventListener("mousemove", this.onDocumentMove, true);
      document.removeEventListener("mouseup", this.onDocumentUp, true);
      this.requestRender();
    }

    /** 방향키는 5초 이동, Home은 가장 오래된 위치, End는 LIVE 복귀로 처리합니다. */
    private handleKey(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !this.state?.seekable) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "End") {
        this.command("GO_LIVE");
        return;
      }
      // Shift와 함께 누르면 긴 구간을 빠르게 훑을 수 있도록 10초씩 이동합니다.
      const seconds = event.shiftKey ? 10 : 5;
      const delta = event.key === "ArrowLeft" ? -seconds : event.key === "ArrowRight" ? seconds : -Infinity;
      const target = delta === -Infinity
        ? this.state.start
        : Math.min(this.state.end, Math.max(this.state.start, this.state.currentTime + delta));
      const atLive = this.state.end - target < LIVE_EPSILON;
      this.state = { ...this.state, currentTime: target, atLive };
      this.command(atLive ? "GO_LIVE" : "SEEK", target);
      this.requestRender();
    }

    /** 재생바에 포커스가 없어도 방송 화면에서 방향키 이동을 사용할 수 있게 합니다. */
    private handleGlobalKey(event: KeyboardEvent): void {
      if (!this.enabled() || event.defaultPrevented || event.isComposing) return;
      // Home/End는 문서 맨 위·아래 이동과 충돌하므로 재생바에 직접 포커스했을 때만 씁니다.
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.target instanceof Element && event.target.closest("#chzzk-plus-playback-bar")) return;
      const active = document.activeElement;
      if (active instanceof Element && active.closest('input, textarea, select, a, button, [contenteditable="true"], [role="textbox"], [role="button"], [role="menuitem"], [role="radio"], [role="switch"]')) return;
      this.handleKey(event);
    }

    /** 마우스를 올린 위치가 LIVE보다 몇 분 전인지 작은 안내문으로 보여 줍니다. */
    private showPreview(event: { clientX: number }): void {
      if (!this.root || !this.state?.seekable) return;
      const position = this.positionFor(event.clientX);
      if (!position) return;
      this.lastPointerX = event.clientX;
      const target = this.state.start + position.ratio * (this.state.end - this.state.start);
      const { tip, line } = this.controls || {};
      if (!tip || !line) return;
      tip.textContent = this.state.end - target < LIVE_EPSILON
        ? "LIVE"
        : formatBehind(target - this.state.end);
      tip.style.left = `${position.x}px`;
      line.style.left = `${position.x}px`;
      tip.classList.add("show");
      line.classList.add("show");
    }

    private hidePreview(): void {
      if (this.dragging) return;
      this.lastPointerX = null;
      this.controls?.tip?.classList.remove("show");
      this.controls?.line?.classList.remove("show");
    }

    /** 위치 정보가 자주 와도 화면 한 장마다 최대 한 번만 재생바를 다시 그립니다. */
    private requestRender(): void {
      if (this.renderFrame) return;
      this.renderFrame = requestAnimationFrame(() => {
        this.renderFrame = 0;
        this.render();
      });
    }

    /** 현재 위치 비율, 시간 글자, LIVE 버튼과 접근성 값을 한꺼번에 갱신합니다. */
    private render(): void {
      if (!this.root || !this.controls) return;
      const state = this.state;
      const range = state?.seekable ? Math.max(0, state.end - state.start) : 0;
      const atLive = !state?.seekable || Boolean(state.atLive) || state.end - state.currentTime < LIVE_EPSILON;
      const percent = !state?.seekable || range <= 0
        ? 100
        : atLive ? 100 : Math.min(100, Math.max(0, ((state.currentTime - state.start) / range) * 100));
      const { progress, thumb, position, button, slide } = this.controls;
      progress.style.width = `${percent}%`;
      thumb.classList.toggle("visible", !atLive || this.dragging);
      position.hidden = atLive;
      position.textContent = atLive ? "" : formatBehind(state.currentTime - state.end);
      button.classList.toggle("live", atLive);
      button.disabled = atLive;
      button.querySelector("span")!.textContent = atLive ? "LIVE" : "LIVE 이동";
      button.setAttribute("aria-label", atLive ? "현재 실시간 재생 중" : "실시간으로 이동");
      slide.setAttribute("aria-valuenow", String(Math.round(percent)));
      slide.setAttribute("aria-valuetext", atLive ? "실시간" : formatBehind(state.currentTime - state.end));
      if (this.lastPointerX != null) this.showPreview({ clientX: this.lastPointerX });
    }

    /** 기능 종료 시 치지직 기본 재생바를 복원하고 상태 수신 연결을 해제합니다. */
    stop(): void {
      this.destroy();
      document.removeEventListener("keydown", this.onDocumentKeyDown, true);
      delete CP.actions.updatePlaybackState;
    }
  }
