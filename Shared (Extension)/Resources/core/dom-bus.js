(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;

  CP.DomBus = class DomBus {
    constructor(delay = 300) {
      this.delay = delay;
      this.listeners = new Set();
      this.timer = 0;
      this.active = false;
      this.observer = new MutationObserver((records) => {
        const internalOnly = records.every((record) => record.target instanceof Element
          && record.target.closest('#chzzk-plus-playback-bar, #chzzk-plus-toast, .chzzk-plus-stats'));
        if (!internalOnly) this.schedule();
      });
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    schedule() {
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = 0;
        this.listeners.forEach((listener) => listener());
      }, this.delay);
    }

    start() {
      if (this.active || !document.documentElement) return;
      this.observer.observe(document.documentElement, { childList: true, subtree: true });
      this.active = true;
      this.schedule();
    }

    pause() {
      clearTimeout(this.timer);
      this.timer = 0;
      this.observer.disconnect();
      this.active = false;
    }

    stop() {
      this.pause();
      this.listeners.clear();
    }
  };
})();
