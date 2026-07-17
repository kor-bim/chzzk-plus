(() => {
  "use strict";
  if (window.__chzzkPlusBlindedInstalled) return;
  Object.defineProperty(window, "__chzzkPlusBlindedInstalled", { value: true });

  let settings = {
    enabled: false,
    blindedRestoreEnabled: true,
    blindedAutoRestoreEnabled: false
  };
  let lastSettingsKey = "";
  const isEnabled = () => settings.enabled !== false && settings.blindedRestoreEnabled !== false;
  class BlindedMessageRestorer {
    constructor() {
      this.cache = new Map();
      this.maxCacheEntries = 600;
      this.scanScheduled = false;
      this.observing = false;
      this.pendingItems = new Set();
      this.itemSelector = [
        '[class*="live_chatting_list_item"]',
        '[class*="chatting_list_item"]',
        '[class*="_item_sg7hy_"]'
      ].join(",");
      this.textSelector = [
        '[class*="live_chatting_message_text"]',
        '[class*="chatting_message_text"]',
        '[class*="message_text"]',
        '[class*="_message_"]'
      ].join(",");
      this.observer = new MutationObserver((records) => {
        if (!isEnabled()) return;
        records.forEach((record) => record.addedNodes.forEach((node) => this.enqueueNode(node)));
        this.scheduleScan();
      });
    }

    findChatMessage(value, depth = 0) {
      if (!value || typeof value !== "object" || depth > 4) return null;
      if (value.chatMessage?.key || value.chatMessage?.content) return value.chatMessage;
      if ((value.key || value.messageId) && (value.originalContent || value.content)) return value;
      for (const key of ["children", "props", "data", "message", "item"]) {
        const found = this.findChatMessage(value[key], depth + 1);
        if (found) return found;
      }
      return null;
    }

    getReactMessage(element) {
      let cursor = element;
      for (let depth = 0; cursor && depth < 4; depth += 1, cursor = cursor.parentElement) {
        for (const key of Object.keys(cursor)) {
          if (key.startsWith("__reactProps$")) {
            const found = this.findChatMessage(cursor[key]);
            if (found) return found;
          }
          if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
            let fiber = cursor[key];
            for (let level = 0; fiber && level < 14; level += 1, fiber = fiber.return) {
              const found = this.findChatMessage(fiber.memoizedProps);
              if (found) return found;
            }
          }
        }
      }
      return null;
    }

    normalizeContent(content) {
      if (Array.isArray(content)) {
        return content.map((item) => {
          if (typeof item === "string") return item;
          if (item?.type === "text") return item.value || "";
          if (item?.type === "emoji") return `{${item.name || "이모티콘"}}`;
          return "";
        }).join("");
      }
      return content == null ? "" : String(content);
    }

    isBlinded(text) {
      return /블라인드|클린봇|운영정책에 의해/.test(text || "");
    }

    processItem(item) {
      const textElement = item.querySelector(this.textSelector);
      if (!textElement) return;
      const message = this.getReactMessage(item);
      const key = message?.key || message?.messageId || item.dataset.messageId || null;
      const original = this.normalizeContent(message?.originalContent || message?.content);
      if (key && original && !this.isBlinded(original)) {
        this.cache.set(String(key), original);
        if (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value);
      }
      if (!this.isBlinded(textElement.textContent)) return;
      const recoverable = original && !this.isBlinded(original) ? original : key ? this.cache.get(String(key)) : null;
      if (recoverable) this.prepare(textElement, recoverable);
    }

    prepare(textElement, original) {
      if (textElement.dataset.chzzkPlusBlinded === "ready") {
        textElement.dataset.chzzkPlusOriginal = original;
        settings.blindedAutoRestoreEnabled ? this.restore(textElement) : this.conceal(textElement);
        return;
      }
      textElement.dataset.chzzkPlusBlinded = "ready";
      textElement.dataset.chzzkPlusPlaceholder = textElement.textContent || "";
      textElement.dataset.chzzkPlusOriginal = original;
      textElement.classList.add("chzzk-plus-blinded");
      textElement.addEventListener("mouseenter", () => this.restore(textElement));
      textElement.addEventListener("mouseleave", () => {
        if (!settings.blindedAutoRestoreEnabled) this.conceal(textElement);
      });
      if (settings.blindedAutoRestoreEnabled) this.restore(textElement);
    }

    restore(element) {
      if (!element.dataset.chzzkPlusOriginal) return;
      element.textContent = element.dataset.chzzkPlusOriginal;
      element.classList.add("chzzk-plus-blinded-restored");
    }

    conceal(element) {
      if (element.dataset.chzzkPlusPlaceholder != null) element.textContent = element.dataset.chzzkPlusPlaceholder;
      element.classList.remove("chzzk-plus-blinded-restored");
    }

    enqueueNode(node) {
      if (!(node instanceof Element)) return;
      if (node.matches(this.itemSelector)) this.pendingItems.add(node);
      node.querySelectorAll(this.itemSelector).forEach((item) => this.pendingItems.add(item));
    }

    scheduleScan(full = false) {
      if (this.scanScheduled || !isEnabled()) return;
      if (full) document.querySelectorAll(this.itemSelector).forEach((item) => this.pendingItems.add(item));
      this.scanScheduled = true;
      requestAnimationFrame(() => {
        this.scanScheduled = false;
        const items = [...this.pendingItems];
        this.pendingItems.clear();
        items.forEach((item) => item.isConnected && this.processItem(item));
      });
    }

    update() {
      const elements = document.querySelectorAll('[data-chzzk-plus-blinded="ready"]');
      if (!isEnabled()) {
        elements.forEach((element) => this.conceal(element));
        this.observer.disconnect();
        this.observing = false;
        this.pendingItems.clear();
        return;
      }
      if (!this.observing) {
        this.observer.observe(document.documentElement, { childList: true, subtree: true });
        this.observing = true;
      }
      if (settings.blindedAutoRestoreEnabled) elements.forEach((element) => this.restore(element));
      else elements.forEach((element) => this.conceal(element));
      this.scheduleScan(true);
    }

    install() {
      this.update();
    }
  }

  const restorer = new BlindedMessageRestorer();
  restorer.install();
  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.source === "chzzk-plus-content" && event.data.type === "SETTINGS") {
      const next = { ...settings, ...(event.data.settings || {}) };
      const key = `${next.enabled}:${next.blindedRestoreEnabled}:${next.blindedAutoRestoreEnabled}`;
      if (key === lastSettingsKey) return;
      lastSettingsKey = key;
      settings = next;
      restorer.update();
    }
  });
  window.postMessage({ source: "chzzk-plus-main", type: "READY", module: "blinded" }, "*");
})();
