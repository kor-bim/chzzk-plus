(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;

  CP.modules.StreamStats = class StreamStats {
    constructor() {
      this.overlay = null;
      this.body = null;
      this.rows = new Map();
      this.timer = 0;
      this.lastBytes = 0;
      this.lastBytesAt = 0;
      this.bitrate = null;
      document.addEventListener("keydown", (event) => {
        if (!CP.settings.enabled || !CP.settings.streamStatsEnabled) return;
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
          event.preventDefault();
          this.toggle();
        }
      }, true);
      CP.actions.toggleStats = () => this.toggle();
    }

    createOverlay() {
      const root = document.createElement("section");
      root.className = "chzzk-plus-stats";
      root.innerHTML = `<header><strong>스트림 통계</strong><button type="button" aria-label="닫기">×</button></header><div class="chzzk-plus-stats-body"></div>`;
      root.querySelector("button").addEventListener("click", () => this.hide());
      (CP.findPlayer() || document.body).appendChild(root);
      this.overlay = root;
      this.body = root.querySelector(".chzzk-plus-stats-body");
    }

    collect(video) {
      const quality = video.getVideoPlaybackQuality?.() || {};
      const now = performance.now();
      const bytes = Number(video.webkitVideoDecodedByteCount || 0);
      if (bytes > 0 && this.lastBytes > 0 && now > this.lastBytesAt) {
        this.bitrate = ((bytes - this.lastBytes) * 8) / ((now - this.lastBytesAt) / 1000) / 1_000_000;
      }
      this.lastBytes = bytes;
      this.lastBytesAt = now;
      const edge = video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : null;
      const buffered = video.buffered?.length ? video.buffered.end(video.buffered.length - 1) : video.currentTime;
      return {
        "해상도": `${video.videoWidth || 0} × ${video.videoHeight || 0}`,
        "추정 비트레이트": this.bitrate == null ? "측정 중" : `${this.bitrate.toFixed(2)} Mbps`,
        "버퍼": `${Math.max(0, buffered - video.currentTime).toFixed(2)}초`,
        "LIVE 지연": edge == null ? "—" : `${Math.max(0, edge - video.currentTime).toFixed(2)}초`,
        "드롭 프레임": `${quality.droppedVideoFrames || 0} / ${quality.totalVideoFrames || 0}`,
        "재생 속도": `${video.playbackRate.toFixed(2)}×`,
        "볼륨": `${Math.round(video.volume * 100)}%`,
        "Ready / Network": `${video.readyState} / ${video.networkState}`
      };
    }

    render() {
      clearTimeout(this.timer);
      if (!this.overlay?.isConnected) return;
      const video = CP.findVideo();
      if (!video) {
        this.body.textContent = "재생 중인 영상을 찾을 수 없습니다.";
        this.rows.clear();
      } else {
        const values = this.collect(video);
        if (!this.rows.size) {
          this.body.replaceChildren(...Object.keys(values).map((label) => {
            const row = document.createElement("div");
            const key = document.createElement("span");
            const val = document.createElement("b");
            key.textContent = label;
            row.append(key, val);
            this.rows.set(label, val);
            return row;
          }));
        }
        Object.entries(values).forEach(([label, value]) => {
          const target = this.rows.get(label);
          if (target && target.textContent !== value) target.textContent = value;
        });
      }
      this.timer = setTimeout(() => this.render(), 1000);
    }

    show() {
      if (!CP.settings.enabled || !CP.settings.streamStatsEnabled) return;
      if (!this.overlay?.isConnected) this.createOverlay();
      this.render();
    }

    hide() {
      clearTimeout(this.timer);
      this.overlay?.remove();
      this.overlay = null;
      this.body = null;
      this.rows.clear();
      this.lastBytes = 0;
      this.lastBytesAt = 0;
      this.bitrate = null;
    }

    toggle() {
      this.overlay?.isConnected ? this.hide() : this.show();
    }

    injectContextMenu() {
      if (!CP.settings.statsContextMenuEnabled) return;
      const pane = document.querySelector(CP.SELECTORS.contextPane);
      const list = pane?.querySelector(CP.SELECTORS.contextList);
      if (!list || list.querySelector("[data-chzzk-plus-context]")) return;

      const makeItem = (label, action) => {
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

    update() {
      if (!CP.settings.enabled || !CP.settings.streamStatsEnabled) this.hide();
      if (!CP.settings.enabled || !CP.settings.statsContextMenuEnabled) {
        document.querySelectorAll("[data-chzzk-plus-context]").forEach((item) => item.remove());
      }
    }

    scan() {
      if (CP.settings.enabled) this.injectContextMenu();
    }
  };
})();
