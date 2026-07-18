import { CP, type StreamStatistics } from "../content/runtime";

/**
 * 현재 영상의 품질 정보를 1초마다 읽어 플레이어 위 통계창에 표시합니다.
 * 통계창을 열었을 때만 타이머가 돌며, 값이 바뀐 글자만 수정해 화면 작업을 줄입니다.
 */
export class StreamStats {
    readonly id = "stream-stats";
    private overlay: HTMLElement | null = null;
    private body: HTMLElement | null = null;
    private readonly rows = new Map<string, HTMLElement>();
    private timer: ReturnType<typeof setTimeout> | undefined;
    private readonly onKeyDown = (event: KeyboardEvent): void => {
      if (!CP.settings.enabled || !CP.settings.streamStatsEnabled) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        this.toggle();
      }
    };

    /** 통계 단축키와 다른 화면에서 통계를 열 수 있는 동작을 연결합니다. */
    start(): void {
      document.addEventListener("keydown", this.onKeyDown, true);
      CP.actions.toggleStats = () => this.toggle();
    }

    /** 통계값을 넣을 세 칸짜리 요약 영역과 상세 목록을 다시 만듭니다. */
    private resetBody(): void {
      if (!this.body) return;
      this.body.innerHTML = `
        <div class="chzzk-plus-stats-highlight"></div>
        <div class="chzzk-plus-stats-details"></div>
        <p class="chzzk-plus-stats-empty" hidden>재생 중인 영상을 찾을 수 없습니다.</p>`;
      this.rows.clear();
    }

    /** 플레이어 위에 둥근 카드형 통계창을 만듭니다. */
    createOverlay(): void {
      const root = document.createElement("section");
      root.className = "chzzk-plus-stats";
      root.innerHTML = `
        <header>
          <div><i></i><strong>스트림 통계</strong></div>
          <button type="button" aria-label="닫기">×</button>
        </header>
        <div class="chzzk-plus-stats-body"></div>`;
      root.querySelector("button")?.addEventListener("click", () => this.hide());
      (CP.findPlayer() || document.body).appendChild(root);
      this.overlay = root;
      this.body = root.querySelector(".chzzk-plus-stats-body");
      this.resetBody();
    }

    /** 재생 위치가 들어 있는 버퍼 구간만 골라 남은 시간을 계산합니다. */
    private fallbackBuffer(video: HTMLVideoElement): number {
      for (let index = 0; index < video.buffered.length; index += 1) {
        if (video.currentTime >= video.buffered.start(index) - 0.05
          && video.currentTime <= video.buffered.end(index) + 0.05) {
          return Math.max(0, video.buffered.end(index) - video.currentTime);
        }
      }
      return 0;
    }

    /** 플레이어가 직접 알려 준 값과 video 요소의 실제 값을 사람이 읽기 쉽게 바꿉니다. */
    collect(video: HTMLVideoElement, stats?: StreamStatistics): Record<string, string> {
      const quality = video.getVideoPlaybackQuality?.();
      const bitrate = stats?.bitrateKbps;
      const dropped = stats?.droppedFrames ?? quality?.droppedVideoFrames ?? 0;
      const total = stats?.totalFrames ?? quality?.totalVideoFrames ?? 0;
      const droppedRate = total > 0 ? ` · ${((dropped / total) * 100).toFixed(2)}%` : "";
      const readyLabels = ["정보 없음", "정보 확인", "현재 위치 준비", "재생 가능", "충분히 준비"];
      const networkLabels = ["비어 있음", "대기", "받는 중", "오류"];
      return {
        "화질": `${CP.playerStatus.quality} · ${stats?.resolution || `${video.videoWidth} × ${video.videoHeight}`}`,
        "영상 전송률": bitrate == null ? "확인 불가" : `${(bitrate / 1000).toFixed(1)} Mbps`,
        "방송 지연": stats?.latencySeconds == null ? "확인 불가" : `${stats.latencySeconds.toFixed(2)}초`,
        "미리 받은 영상": `${(stats?.bufferSeconds ?? this.fallbackBuffer(video)).toFixed(2)}초`,
        "초당 화면 수": stats?.fps == null ? "확인 불가" : `${stats.fps} fps`,
        "놓친 화면": `${dropped} / ${total}${droppedRate}`,
        "재생 속도": `${(stats?.playbackRate ?? video.playbackRate).toFixed(2)}×`,
        "볼륨": `${Math.round((stats?.volume ?? (video.muted ? 0 : video.volume)) * 100)}%`,
        "영상 상태": `${readyLabels[stats?.readyState ?? video.readyState] || "알 수 없음"} · ${networkLabels[stats?.networkState ?? video.networkState] || "알 수 없음"}`
      };
    }

    /** 통계창이 열려 있는 동안 값 목록을 만들거나 기존 글자만 갱신합니다. */
    render(): void {
      clearTimeout(this.timer);
      if (!this.overlay?.isConnected || !this.body) return;
      const video = CP.findVideo();
      if (!video) {
        this.body.querySelector<HTMLElement>(".chzzk-plus-stats-highlight")?.setAttribute("hidden", "");
        this.body.querySelector<HTMLElement>(".chzzk-plus-stats-details")?.setAttribute("hidden", "");
        this.body.querySelector<HTMLElement>(".chzzk-plus-stats-empty")?.removeAttribute("hidden");
        this.rows.clear();
      } else {
        if (!this.body.querySelector(".chzzk-plus-stats-highlight")) this.resetBody();
        this.body.querySelector<HTMLElement>(".chzzk-plus-stats-highlight")?.removeAttribute("hidden");
        this.body.querySelector<HTMLElement>(".chzzk-plus-stats-details")?.removeAttribute("hidden");
        this.body.querySelector<HTMLElement>(".chzzk-plus-stats-empty")?.setAttribute("hidden", "");
        const values = this.collect(video, CP.playerStatus.stats);
        if (!this.rows.size) {
          const highlight = this.body.querySelector(".chzzk-plus-stats-highlight");
          const details = this.body.querySelector(".chzzk-plus-stats-details");
          if (!highlight || !details) return;
          Object.keys(values).forEach((label, index) => {
            const row = document.createElement("div");
            row.className = index < 3 ? "stat-card" : "stat-row";
            const key = document.createElement("span");
            const val = document.createElement("b");
            key.textContent = label;
            row.append(key, val);
            this.rows.set(label, val);
            (index < 3 ? highlight : details).appendChild(row);
          });
        }
        Object.entries(values).forEach(([label, value]) => {
          const target = this.rows.get(label);
          if (target && target.textContent !== value) target.textContent = value;
        });
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
      this.body = null;
      this.rows.clear();
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
      delete CP.actions.toggleStats;
    }
  }
