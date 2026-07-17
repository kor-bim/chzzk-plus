(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;

  class App {
    constructor() {
      this.domBus = new CP.DomBus();
      this.pageScriptsRequested = false;
      this.settingsKey = "";
      this.instances = [
        new CP.modules.Sharpness(),
        new CP.modules.PlaybackBar(),
        new CP.modules.StreamStats(),
        new CP.modules.Screenshot(),
        new CP.modules.AdUi(),
        new CP.modules.ChatStyle()
      ];
      this.domBus.subscribe(() => this.scan());
    }

    ensurePageScripts() {
      if (this.pageScriptsRequested) return;
      this.pageScriptsRequested = true;
      CP.injectPageScripts();
    }

    update(nextSettings) {
      const normalized = CP.normalizeSettings(nextSettings);
      const settingsKey = JSON.stringify(normalized);
      if (settingsKey === this.settingsKey) return;
      this.settingsKey = settingsKey;
      CP.settings = normalized;
      if (CP.settings.enabled) {
        this.domBus.start();
        this.ensurePageScripts();
      } else {
        this.domBus.pause();
      }
      this.instances.forEach((module) => {
        try { module.update?.(); }
        catch (error) { CP.Debug.error(module.constructor.name, "설정 적용 실패", error); }
      });
      CP.postSettingsToPage();
      if (CP.settings.enabled) this.scan();
    }

    scan() {
      this.instances.forEach((module) => {
        try { module.scan?.(); }
        catch (error) { CP.Debug.error(module.constructor.name, "DOM 연결 실패", error); }
      });
    }

    async start() {
      CP.onSettingsChanged = (nextSettings) => this.update(nextSettings);
      const stored = await CP.ext.storage.local.get("settings");
      this.update(stored.settings);
    }
  }

  const app = new App();
  app.start();
  let lastAdToastAt = 0;

  CP.ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) app.update(changes.settings.newValue);
  });

  CP.ext.runtime.onMessage.addListener((message) => {
    if (message?.type === "CHZZK_PLUS_SETTINGS") app.update(message.settings);
    if (message?.type === "CHZZK_PLUS_CAPTURE") CP.actions.captureScreenshot?.();
    if (message?.type === "CHZZK_PLUS_GET_STATUS") return Promise.resolve({ status: CP.readPlayerStatus() });
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "chzzk-plus-main") return;
    switch (event.data.type) {
      case "READY":
        CP.postSettingsToPage();
        break;
      case "PLAYER_STATUS":
        CP.playerStatus = { ...CP.playerStatus, ...event.data.status };
        break;
      case "PLAYBACK_STATE":
        CP.actions.updatePlaybackState?.(event.data.state);
        break;
      case "DIAGNOSTIC":
        if (event.data.level === "error") CP.Debug.error(event.data.scope || "Page", event.data.message || "오류");
        break;
      case "AD_BLOCKED": {
        const now = Date.now();
        if (now - lastAdToastAt > 6000) {
          lastAdToastAt = now;
          CP.Toast.show(`광고 차단 · ${event.data.label || "처리 완료"}`);
        }
        break;
      }
      default:
        break;
    }
  });

  const extensionBase = CP.ext.runtime.getURL("");
  addEventListener("error", (event) => {
    const stack = event.error?.stack || "";
    if ((event.filename || "").startsWith(extensionBase) || stack.includes(extensionBase)) {
      CP.Debug.error("Content", event.message || "처리되지 않은 오류", event.error);
    }
  });
  addEventListener("unhandledrejection", (event) => {
    const stack = event.reason?.stack || "";
    if (stack.includes(extensionBase)) CP.Debug.error("Content", "처리되지 않은 Promise 오류", event.reason);
  });
})();
