(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;
  const LIVE_EPSILON = 3.5;

  CP.modules.PlaybackBar = class PlaybackBar {
    constructor() {
      this.root = null;
      this.bottom = null;
      this.state = null;
      this.hiddenNative = new Map();
      this.controls = null;
      this.renderFrame = 0;
      this.dragging = false;
      this.lastPointerX = null;
      this.onDocumentMove = (event) => this.drag(event);
      this.onDocumentUp = (event) => this.endDrag(event);
      CP.actions.updatePlaybackState = (state) => this.receiveState(state);
    }

    enabled() {
      return CP.settings.enabled && CP.settings.playbackBarEnabled && /^\/live\//.test(location.pathname);
    }

    receiveState(state) {
      this.state = state;
      if (this.enabled()) {
        if (!this.root?.isConnected) this.scan();
        this.requestRender();
      }
    }

    findBottom(video) {
      const player = video?.closest(".pzp-pc, .pzp") || document.querySelector(".pzp-pc, .pzp");
      return player?.querySelector(".pzp-pc__bottom, .pzp-pc-bottom")
        || document.querySelector(".pzp-pc__bottom, .pzp-pc-bottom");
    }

    hideNative(bottom) {
      const elements = new Set(bottom.querySelectorAll(":scope > .pzp-pc-progress-slider, :scope > [class*=\"slider_wrap__\"]"));
      const legacySlider = bottom.querySelector(":scope > .slider") || bottom.querySelector(".slider");
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

    restoreNative() {
      this.hiddenNative.forEach((style, element) => {
        if (!element.isConnected) return;
        if (style.display) element.style.setProperty("display", style.display, style.priority);
        else element.style.removeProperty("display");
      });
      this.hiddenNative.clear();
    }

    mount(bottom) {
      this.destroy();
      this.bottom = bottom;
      this.hideNative(bottom);

      const root = document.createElement("div");
      root.id = "chzzk-plus-playback-bar";
      root.className = "live-bar-box pzp-pc__progress-slider";
      root.innerHTML = `
        <div class="live-bar-ui">
          <div class="slide-box" role="slider" aria-label="라이브 재생 위치" aria-valuemin="0" aria-valuemax="100" tabindex="0">
            <div class="track"></div>
            <div class="rng"></div>
            <div class="hover-x"></div>
            <div class="hover-tip">LIVE</div>
          </div>
          <div class="time">
            <span class="t total">00:00</span>
            <button class="go live" type="button">LIVE</button>
          </div>
        </div>`;
      bottom.appendChild(root);
      this.root = root;

      const slide = root.querySelector(".slide-box");
      this.controls = {
        slide,
        progress: root.querySelector(".rng"),
        total: root.querySelector(".total"),
        button: root.querySelector(".go"),
        tip: root.querySelector(".hover-tip"),
        line: root.querySelector(".hover-x")
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

    scan() {
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

    update() {
      this.scan();
    }

    destroy() {
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

    command(command, target) {
      window.postMessage({ source: "chzzk-plus-content", type: "PLAYER_COMMAND", command, target }, "*");
    }

    positionFor(clientX) {
      const slide = this.controls?.slide;
      const rect = slide?.getBoundingClientRect();
      if (!rect?.width) return null;
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      return { x, ratio: x / rect.width };
    }

    targetFor(clientX) {
      const position = this.positionFor(clientX);
      if (!position || !this.state?.seekable || this.state.end <= this.state.start) return null;
      return this.state.start + position.ratio * (this.state.end - this.state.start);
    }

    beginDrag(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.dragging = true;
      this.root?.classList.add("no-anim");
      this.lastPointerX = event.clientX;
      const target = this.targetFor(event.clientX);
      if (target != null) {
        this.state = { ...this.state, currentTime: target, atLive: this.state.end - target < LIVE_EPSILON };
        this.command(this.state.atLive ? "GO_LIVE" : "SEEK", target);
        this.requestRender();
      }
      document.addEventListener("mousemove", this.onDocumentMove, true);
      document.addEventListener("mouseup", this.onDocumentUp, true);
    }

    drag(event) {
      if (!this.dragging) return;
      event.preventDefault();
      this.lastPointerX = event.clientX;
      const target = this.targetFor(event.clientX);
      if (target == null) return;
      this.state = { ...this.state, currentTime: target, atLive: this.state.end - target < LIVE_EPSILON };
      this.requestRender();
      this.showPreview(event);
    }

    endDrag(event) {
      if (!this.dragging) return;
      event.preventDefault();
      event.stopPropagation();
      const target = this.targetFor(event.clientX);
      if (target != null) this.command(this.state.end - target < LIVE_EPSILON ? "GO_LIVE" : "SEEK", target);
      this.dragging = false;
      this.root?.classList.remove("no-anim");
      document.removeEventListener("mousemove", this.onDocumentMove, true);
      document.removeEventListener("mouseup", this.onDocumentUp, true);
      this.requestRender();
    }

    handleKey(event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !this.state?.seekable) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "End") {
        this.command("GO_LIVE");
        return;
      }
      const delta = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : -Infinity;
      const target = delta === -Infinity
        ? this.state.start
        : Math.min(this.state.end, Math.max(this.state.start, this.state.currentTime + delta));
      this.command(this.state.end - target < LIVE_EPSILON ? "GO_LIVE" : "SEEK", target);
    }

    showPreview(event) {
      if (!this.root || !this.state?.seekable) return;
      const position = this.positionFor(event.clientX);
      if (!position) return;
      this.lastPointerX = event.clientX;
      const target = this.state.start + position.ratio * (this.state.end - this.state.start);
      const { tip, line } = this.controls || {};
      if (!tip || !line) return;
      tip.textContent = this.state.end - target < LIVE_EPSILON ? "LIVE" : this.formatOffset(target - this.state.end);
      tip.style.left = `${position.x}px`;
      line.style.left = `${position.x}px`;
      tip.classList.add("show");
      line.classList.add("show");
    }

    hidePreview() {
      if (this.dragging) return;
      this.lastPointerX = null;
      this.controls?.tip?.classList.remove("show");
      this.controls?.line?.classList.remove("show");
    }

    requestRender() {
      if (this.renderFrame) return;
      this.renderFrame = requestAnimationFrame(() => {
        this.renderFrame = 0;
        this.render();
      });
    }

    render() {
      if (!this.root || !this.controls) return;
      const state = this.state;
      const range = state?.seekable ? Math.max(0, state.end - state.start) : 0;
      const atLive = !state?.seekable || Boolean(state.atLive) || state.end - state.currentTime < LIVE_EPSILON;
      const percent = !state?.seekable || range <= 0
        ? 100
        : atLive ? 100 : Math.min(100, Math.max(0, ((state.currentTime - state.start) / range) * 100));
      const { progress, total, button, slide } = this.controls;
      progress.style.width = `${percent}%`;
      total.textContent = this.formatDuration(range);
      button.textContent = atLive ? "LIVE" : this.formatOffset(state.currentTime - state.end);
      button.classList.toggle("live", atLive);
      slide.setAttribute("aria-valuenow", String(Math.round(percent)));
      if (this.lastPointerX != null) this.showPreview({ clientX: this.lastPointerX });
    }

    formatDuration(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
      const value = Math.floor(seconds);
      const hours = Math.floor(value / 3600);
      const minutes = Math.floor((value % 3600) / 60);
      const secs = value % 60;
      return hours > 0
        ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    formatOffset(seconds) {
      if (!Number.isFinite(seconds) || seconds > -0.5) return "00:00";
      return `-${this.formatDuration(Math.abs(seconds))}`;
    }
  };
})();
