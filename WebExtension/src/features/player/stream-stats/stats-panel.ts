import { CP } from "../../../runtime/extension-runtime";
import { StreamStatsCollector } from "./stats-collector";
import { formatStreamStats } from "./stats-calculator";

/**
 * 현재 영상의 품질 정보를 1초마다 읽어 플레이어 위 통계창에 표시합니다.
 * 통계창을 열었을 때만 타이머가 돌며, 값이 바뀐 글자만 수정해 화면 작업을 줄입니다.
 */
export class StreamStats {
    readonly id = "stream-stats";
    private overlay: HTMLElement | null = null;
    private panel: HTMLElement | null = null;
    private body: HTMLElement | null = null;
    private drag: { pointerId: number; offsetX: number; offsetY: number } | null = null;
    private readonly collector = new StreamStatsCollector();
    private timer: ReturnType<typeof setTimeout> | undefined;
    private readonly onKeyDown = (event: KeyboardEvent): void => {
      if (!CP.settings.enabled || !CP.settings.streamStatsEnabled) return;
      if (event.key === "Escape" && this.overlay?.isConnected) {
        event.preventDefault();
        this.hide();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        this.toggle();
      }
    };

    /** 통계 단축키를 연결합니다. */
    start(): void {
      document.addEventListener("keydown", this.onKeyDown, true);
    }

    /** 플레이어를 가리지 않는 이동 가능한 고정폭 진단 텍스트 패널을 만듭니다. */
    createOverlay(): void {
      const root = document.createElement("section");
      root.className = "chzzk-plus-stats";
      root.innerHTML = `
        <div class="chzzk-plus-stats-panel">
          <header title="드래그하여 이동"><strong>스트림 통계</strong><button type="button" aria-label="닫기">×</button></header>
          <pre class="chzzk-plus-stats-body">재생 정보를 확인하는 중입니다.</pre>
        </div>`;
      root.querySelector("button")?.addEventListener("click", () => this.hide());
      const panel = root.querySelector<HTMLElement>(".chzzk-plus-stats-panel");
      const handle = root.querySelector<HTMLElement>("header");
      handle?.addEventListener("pointerdown", this.onDragStart);
      handle?.addEventListener("pointermove", this.onDragMove);
      handle?.addEventListener("pointerup", this.onDragEnd);
      handle?.addEventListener("pointercancel", this.onDragEnd);
      (CP.findPlayer() || document.body).appendChild(root);
      this.overlay = root;
      this.panel = panel;
      this.body = root.querySelector(".chzzk-plus-stats-body");
    }

    /** 제목 표시줄을 누른 위치와 패널 왼쪽 위 사이의 거리를 기억합니다. */
    private readonly onDragStart = (event: PointerEvent): void => {
      if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)
        || (event.target instanceof Element && event.target.closest("button"))) return;
      const panel = this.panel;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      this.drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      event.currentTarget.setPointerCapture(event.pointerId);
      panel.classList.add("is-dragging");
      event.preventDefault();
    };

    /** 통계창이 플레이어 밖으로 빠져나가지 않는 범위에서 위치를 바꿉니다. */
    private readonly onDragMove = (event: PointerEvent): void => {
      if (!this.drag || this.drag.pointerId !== event.pointerId || !this.overlay || !this.panel) return;
      const rootRect = this.overlay.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();
      const maxLeft = Math.max(0, rootRect.width - panelRect.width);
      const maxTop = Math.max(0, rootRect.height - panelRect.height);
      const left = Math.max(0, Math.min(maxLeft, event.clientX - rootRect.left - this.drag.offsetX));
      const top = Math.max(0, Math.min(maxTop, event.clientY - rootRect.top - this.drag.offsetY));
      this.panel.style.left = `${Math.round(left)}px`;
      this.panel.style.top = `${Math.round(top)}px`;
    };

    /** 포인터를 놓거나 취소하면 이동 추적을 즉시 끝냅니다. */
    private readonly onDragEnd = (event: PointerEvent): void => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      this.drag = null;
      this.panel?.classList.remove("is-dragging");
    };

    /** 통계창이 열려 있는 동안 값 목록을 만들거나 기존 글자만 갱신합니다. */
    render(): void {
      clearTimeout(this.timer);
      if (!this.overlay?.isConnected || !this.body) return;
      const video = CP.findVideo();
      if (!video) {
        this.body.textContent = "재생 중인 영상을 찾을 수 없습니다.";
      } else {
        const text = formatStreamStats(CP.playerStatus.quality, this.collector.snapshot(video, CP.playerStatus.stats), {
          version: browser.runtime.getManifest().version,
          contentId: location.pathname.match(/\/(?:live|video)\/([^/?]+)/)?.[1] || "확인 불가",
          userAgent: navigator.userAgent
        });
        if (this.body.textContent !== text) this.body.textContent = text;
      }
      this.timer = setTimeout(() => this.render(), 1000);
    }

    /** 설정이 켜져 있을 때 통계창을 만들고 1초 갱신을 시작합니다. */
    show(): void {
      if (!CP.settings.enabled || !CP.settings.streamStatsEnabled) return;
      if (!this.overlay?.isConnected) this.createOverlay();
      this.render();
    }

    /** 통계창과 타이머를 없애고 다음 측정을 위해 누적값을 초기화합니다. */
    hide(): void {
      clearTimeout(this.timer);
      this.overlay?.remove();
      this.overlay = null;
      this.panel = null;
      this.body = null;
      this.drag = null;
      this.collector.stop();
    }

    toggle(): void {
      if (this.overlay?.isConnected) this.hide();
      else this.show();
    }

    /** 플레이어 우클릭 메뉴에 '스트림 통계' 항목을 한 번만 추가합니다. */
    injectContextMenu(): void {
      if (!CP.settings.statsContextMenuEnabled) return;
      const pane = document.querySelector(CP.SELECTORS.contextPane);
      const list = pane?.querySelector(CP.SELECTORS.contextList);
      if (!list || list.querySelector("[data-chzzk-plus-context]")) return;

      const makeItem = (label: string, action: () => void): HTMLLIElement => {
        const item = document.createElement("li");
        item.className = "pzp-ui-contextmenu-item pzp-contextmenu-pane__list-item";
        item.dataset.chzzkPlusContext = "";
        item.setAttribute("role", "menuitem");
        const button = document.createElement("button");
        button.className = "pzp-ui-contextmenu-item__button";
        button.textContent = label;
        button.addEventListener("click", action);
        item.appendChild(button);
        return item;
      };
      list.append(makeItem("스트림 통계", () => this.toggle()));
    }

    update(): void {
      if (!CP.settings.enabled || !CP.settings.streamStatsEnabled) this.hide();
      if (!CP.settings.enabled || !CP.settings.statsContextMenuEnabled) {
        document.querySelectorAll("[data-chzzk-plus-context]").forEach((item) => item.remove());
      }
    }

    scan(): void {
      if (CP.settings.enabled) this.injectContextMenu();
    }

    /** 기능 종료 시 통계창, 단축키, 우클릭 항목과 외부 호출 동작을 정리합니다. */
    stop(): void {
      this.hide();
      document.removeEventListener("keydown", this.onKeyDown, true);
      document.querySelectorAll("[data-chzzk-plus-context]").forEach((item) => item.remove());
    }
  }
