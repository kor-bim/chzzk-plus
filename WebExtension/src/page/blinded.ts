(() => {
  "use strict";

  /**
   * 치지직이 가린 채팅의 원문을 브라우저가 이미 받은 데이터에서 찾아 보여 줍니다.
   *
   * 치지직 화면에는 가림 안내문만 보이더라도, 해당 채팅을 그릴 때 사용한 React
   * 데이터에 원문이 잠시 남아 있는 경우가 있습니다. 이 파일은 새 채팅이 들어올 때
   * 원문과 메시지 고유 번호를 기억하고, 같은 메시지가 나중에 가려지면 연결합니다.
   * 서버가 처음부터 원문을 보내지 않은 메시지는 복구할 수 없습니다.
   */
  if (window.__chzzkPlusBlindedInstalled) return;
  Object.defineProperty(window, "__chzzkPlusBlindedInstalled", { value: true });

  interface BlindedSettings {
    enabled: boolean;
    blindedRestoreEnabled: boolean;
    blindedAutoRestoreEnabled: boolean;
  }

  interface ChatMessage {
    key?: string;
    messageId?: string;
    originalContent?: unknown;
    content?: unknown;
  }

  type ReactCarrier = HTMLElement & Record<string, any>;

  let settings: BlindedSettings = {
    enabled: false,
    blindedRestoreEnabled: true,
    blindedAutoRestoreEnabled: false
  };
  let lastSettingsKey = "";
  const isEnabled = (): boolean => settings.enabled && settings.blindedRestoreEnabled;

  class BlindedMessageRestorer {
    /** 화면에 표시되는 채팅 한 줄을 찾는 선택자입니다. */
    private readonly itemSelector = [
      '[class*="chatting_message_item"]',
      '[class*="live_chatting_list_item"]',
      '[class*="chatting_list_item"]',
      '[class*="_item_"]'
    ].join(",");

    /** 채팅만 감시하도록 실제 메시지 목록 영역을 찾습니다. */
    private readonly listSelector = [
      '[class*="live_chatting_list_container"]',
      '[class*="_container_sg7hy_"]',
      'div[role="log"] > div'
    ].join(",");

    /** 치지직이 블라인드 안내문을 씌운 실제 컨테이너를 찾습니다. */
    private readonly blindedSelector = [
      '[class*="live_chatting_message_is_hidden"]',
      '[class*="chatting_message_is_hidden"]',
      '[class*="_is_hidden_"]'
    ].join(",");

    /** 채팅 글자가 들어 있는 요소를 찾습니다. */
    private readonly textSelector = [
      '[class*="live_chatting_message_text"]',
      '[class*="chatting_message_text"]',
      'div[class*="_chatting_message_"] > span[class*="_text_"]',
      'p[class*="_text_"]'
    ].join(",");

    private readonly cache = new Map<string, string>();
    private readonly maxCacheEntries = 2000;
    private readonly pendingItems = new Set<HTMLElement>();
    private scanScheduled = false;
    private activeContainer: HTMLElement | null = null;
    private mountTimer: number | undefined;

    /** 감시기가 놓친 경우에도 가림막 위로 마우스가 오면 해당 채팅을 다시 준비합니다. */
    private readonly onMouseOver = (event: MouseEvent): void => {
      if (!isEnabled() || !(event.target instanceof HTMLElement)) return;
      const blinded = event.target.closest<HTMLElement>(this.blindedSelector);
      if (!blinded) return;
      this.processItem(blinded.closest<HTMLElement>(this.itemSelector) || blinded);
    };

    private readonly observer = new MutationObserver((records) => {
      if (!isEnabled()) return;
      for (const record of records) {
        // 치지직은 메시지를 새로 만들기도 하고 기존 항목의 class만 바꿔 가리기도 합니다.
        if (record.type === "attributes") this.enqueueNode(record.target);
        for (const node of record.addedNodes) this.enqueueNode(node);
      }
      this.scheduleScan();
    });

    /** 방송 전환 뒤 채팅 목록이 교체되면 새 목록으로 감시 대상을 옮깁니다. */
    private attachToChatList(): void {
      if (!isEnabled()) return;
      const container = document.querySelector<HTMLElement>(this.listSelector);
      if (!container) {
        this.observer.disconnect();
        this.activeContainer = null;
        return;
      }
      if (container === this.activeContainer) return;
      this.observer.disconnect();
      this.activeContainer = container;
      this.observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
      });
      this.scheduleScan(true);
    }

    /** 배열 형태의 글자와 이모티콘도 한 줄 문자열로 바꿉니다. */
    private normalizeContent(content: unknown): string {
      if (Array.isArray(content)) {
        return content.map((item: any) => {
          if (typeof item === "string") return item;
          if (item?.type === "text") return item.value || "";
          if (item?.type === "emoji") return `{${item.name || "이모티콘"}}`;
          return "";
        }).join("");
      }
      return content == null ? "" : String(content);
    }

    /** 실제 원문이 아니라 치지직의 가림 안내 문구인지 확인합니다. */
    private isBlindedText(text: string | null | undefined): boolean {
      return /블라인드|클린봇|운영정책에 의해|가려진 메시지/.test(text || "");
    }

    /**
     * React 데이터의 자주 쓰이는 위치만 최대 5단계까지 확인합니다.
     * 모든 속성을 끝없이 탐색하면 채팅이 많은 방송에서 느려질 수 있어 범위를 제한합니다.
     */
    private findChatMessage(value: any, depth = 0, visited = new WeakSet<object>()): ChatMessage | null {
      if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) return null;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = this.findChatMessage(item, depth + 1, visited);
          if (found) return found;
        }
        return null;
      }
      if (value.chatMessage?.key || value.chatMessage?.content || value.chatMessage?.originalContent) {
        return value.chatMessage;
      }
      if ((value.key || value.messageId) && (value.originalContent || value.content)) return value;
      for (const key of ["props", "children", "data", "message", "item", "memoizedProps", "pendingProps"]) {
        const found = this.findChatMessage(value[key], depth + 1, visited);
        if (found) return found;
      }
      return null;
    }

    /** 채팅 요소와 부모 요소에 React가 숨겨 둔 메시지 데이터를 찾습니다. */
    private getReactMessage(element: HTMLElement): ChatMessage | null {
      let cursor: ReactCarrier | null = element as ReactCarrier;
      for (let parentDepth = 0; cursor && parentDepth < 5; parentDepth += 1, cursor = cursor.parentElement as ReactCarrier | null) {
        for (const key of Object.getOwnPropertyNames(cursor)) {
          if (key.startsWith("__reactProps$")) {
            const direct = this.findChatMessage(cursor[key]);
            if (direct) return direct;
          }
          if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
          let fiber = cursor[key];
          for (let level = 0; fiber && level < 16; level += 1, fiber = fiber.return) {
            const found = this.findChatMessage(fiber.memoizedProps)
              || this.findChatMessage(fiber.pendingProps);
            if (found) return found;
          }
        }
      }
      return null;
    }

    /**
     * 어떤 화면 버전에서는 메시지 데이터가 깊은 구조가 아니라 채팅 줄 바로 아래에
     * 붙습니다. 이 흔한 위치를 먼저 확인하면 불필요한 탐색을 크게 줄일 수 있습니다.
     */
    private getDirectReactMessage(element: HTMLElement): ChatMessage | null {
      let cursor: ReactCarrier | null = element as ReactCarrier;
      for (let depth = 0; cursor && depth < 5; depth += 1, cursor = cursor.parentElement as ReactCarrier | null) {
        for (const key of Object.getOwnPropertyNames(cursor)) {
          if (!key.startsWith("__reactProps$") && !key.startsWith("__reactEvents$")) continue;
          const props = cursor[key];
          const direct = props?.chatMessage || props?.children?.props?.chatMessage;
          if (direct) return direct;
        }
      }
      return null;
    }

    /** React 목록 키까지 확인해 캐시에 저장한 원문과 가려진 메시지를 연결합니다. */
    private findMessageKey(element: HTMLElement, message: ChatMessage | null): string | null {
      if (message?.key || message?.messageId) return String(message.key || message.messageId);
      let cursor: ReactCarrier | null = element as ReactCarrier;
      for (let parentDepth = 0; cursor && parentDepth < 5; parentDepth += 1, cursor = cursor.parentElement as ReactCarrier | null) {
        for (const key of Object.getOwnPropertyNames(cursor)) {
          if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
          let fiber = cursor[key];
          for (let level = 0; fiber && level < 16; level += 1, fiber = fiber.return) {
            const candidate = fiber.key || fiber.memoizedProps?.key;
            if (typeof candidate === "string" && candidate.length > 4) return candidate;
          }
        }
      }
      return element.dataset.messageId || null;
    }

    /** 메시지 번호가 같은 원문을 치지직 채팅 목록의 내부 보관 배열에서 찾습니다. */
    private findMessageByKey(value: any, expectedKey: string, depth = 0, visited = new WeakSet<object>()): ChatMessage | null {
      if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) return null;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = this.findMessageByKey(item, expectedKey, depth + 1, visited);
          if (found) return found;
        }
        return null;
      }
      const candidate = value.chatMessage || value;
      const candidateKey = candidate?.key || candidate?.messageId;
      if (String(candidateKey || "") === expectedKey && (candidate.originalContent || candidate.content)) {
        return candidate;
      }
      for (const key of ["props", "children", "data", "message", "item", "memoizedState", "baseState"]) {
        const found = this.findMessageByKey(value[key], expectedKey, depth + 1, visited);
        if (found) return found;
      }
      return null;
    }

    /**
     * 화면 요소의 데이터가 이미 가림 문구로 바뀐 경우, 상위 채팅 목록이 보관 중인
     * 최근 메시지 배열을 확인합니다. 가려진 메시지에만 실행하므로 평소 채팅 성능에는
     * 영향을 거의 주지 않습니다.
     */
    private getMessageFromChatList(element: HTMLElement, expectedKey: string): ChatMessage | null {
      let cursor: ReactCarrier | null = element as ReactCarrier;
      for (let parentDepth = 0; cursor && parentDepth < 6; parentDepth += 1, cursor = cursor.parentElement as ReactCarrier | null) {
        for (const property of Object.getOwnPropertyNames(cursor)) {
          if (!property.startsWith("__reactFiber$") && !property.startsWith("__reactInternalInstance$")) continue;
          let fiber = cursor[property];
          for (let level = 0; fiber && level < 24; level += 1, fiber = fiber.return) {
            let hook = fiber.memoizedState;
            for (let hookIndex = 0; hook && hookIndex < 24; hookIndex += 1, hook = hook.next) {
              const found = this.findMessageByKey(hook.memoizedState, expectedKey);
              if (found) return found;
            }
          }
        }
      }
      return null;
    }

    /** 오래된 항목부터 지워 메모리가 계속 늘어나지 않게 원문을 보관합니다. */
    private remember(key: string, original: string): void {
      this.cache.set(key, original);
      if (this.cache.size <= this.maxCacheEntries) return;
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    /** 마우스를 올리거나 항상 표시 설정이 켜졌을 때 원문으로 바꿉니다. */
    private restore(textElement: HTMLElement): void {
      if (!isEnabled() || !textElement.dataset.chzzkPlusOriginal) return;
      textElement.textContent = textElement.dataset.chzzkPlusOriginal;
      textElement.classList.add("chzzk-plus-blinded-restored");
    }

    /** 원문 표시를 끝내면 치지직이 원래 보여 준 가림 안내문으로 돌립니다. */
    private conceal(textElement: HTMLElement): void {
      if (textElement.dataset.chzzkPlusPlaceholder != null) {
        textElement.textContent = textElement.dataset.chzzkPlusPlaceholder;
      }
      textElement.classList.remove("chzzk-plus-blinded-restored");
    }

    /** 현재 시점의 화면 데이터와 채팅 목록에서 원문을 다시 찾습니다. */
    private resolveOriginal(item: HTMLElement): string {
      let message = this.getDirectReactMessage(item) || this.getReactMessage(item);
      const key = this.findMessageKey(item, message);
      let original = this.normalizeContent(message?.originalContent ?? message?.content);
      if ((!original || this.isBlindedText(original)) && key) {
        message = this.getMessageFromChatList(item, key) || message;
        original = this.normalizeContent(message?.originalContent ?? message?.content);
      }
      if ((!original || this.isBlindedText(original)) && key) original = this.cache.get(key) || "";
      if (key && original && !this.isBlindedText(original)) this.remember(key, original);
      return this.isBlindedText(original) ? "" : original;
    }

    /** 원문을 찾은 글자 요소에 한 번만 마우스 동작을 연결합니다. */
    private prepare(textElement: HTMLElement, item: HTMLElement, hoverTarget: HTMLElement, initialOriginal = ""): void {
      if (initialOriginal) textElement.dataset.chzzkPlusOriginal = initialOriginal;
      if (textElement.dataset.chzzkPlusBlinded !== "ready") {
        textElement.dataset.chzzkPlusBlinded = "ready";
        textElement.dataset.chzzkPlusPlaceholder = textElement.textContent || "";
        textElement.classList.add("chzzk-plus-blinded");
        hoverTarget.classList.add("chzzk-plus-blinded");
        hoverTarget.addEventListener("mouseenter", () => {
          const original = this.resolveOriginal(item);
          if (original) {
            textElement.dataset.chzzkPlusOriginal = original;
            textElement.removeAttribute("title");
            this.restore(textElement);
          } else {
            textElement.title = "치지직이 브라우저에 원문을 보내지 않아 표시할 수 없습니다.";
          }
        });
        hoverTarget.addEventListener("mouseleave", () => {
          if (!settings.blindedAutoRestoreEnabled) this.conceal(textElement);
        });
      }
      if (settings.blindedAutoRestoreEnabled && textElement.dataset.chzzkPlusOriginal) this.restore(textElement);
      else this.conceal(textElement);

      // Safari에서는 화면이 먼저 생기고 메시지 데이터가 조금 늦게 연결될 수 있습니다.
      if (!textElement.dataset.chzzkPlusOriginal && textElement.dataset.chzzkPlusRetry !== "scheduled") {
        textElement.dataset.chzzkPlusRetry = "scheduled";
        for (const delay of [50, 250, 1000]) {
          setTimeout(() => {
            if (!textElement.isConnected || !isEnabled() || textElement.dataset.chzzkPlusOriginal) return;
            const original = this.resolveOriginal(item);
            if (!original) return;
            textElement.dataset.chzzkPlusOriginal = original;
            textElement.removeAttribute("title");
            if (settings.blindedAutoRestoreEnabled) this.restore(textElement);
          }, delay);
        }
      }
    }

    /** 일반 채팅은 원문을 기억하고, 가려진 채팅은 같은 번호의 원문을 찾아 연결합니다. */
    private processItem(item: HTMLElement): void {
      const message = this.getDirectReactMessage(item) || this.getReactMessage(item);
      const key = this.findMessageKey(item, message);
      const directOriginal = this.normalizeContent(message?.originalContent ?? message?.content);
      if (key && directOriginal && !this.isBlindedText(directOriginal)) this.remember(key, directOriginal);

      const targets = new Set<HTMLElement>();
      if (item.matches(this.blindedSelector)) targets.add(item);
      item.querySelectorAll<HTMLElement>(this.blindedSelector).forEach((target) => targets.add(target));

      // 클래스 선택자가 바뀐 경우에도 실제 안내 문구가 있으면 마지막 안전장치로 처리합니다.
      if (!targets.size) {
        item.querySelectorAll<HTMLElement>(this.textSelector).forEach((text) => {
          if (this.isBlindedText(text.textContent)) targets.add(text.parentElement || text);
        });
      }

      for (const target of targets) {
        const textElement = target.matches(this.textSelector)
          ? target
          : target.querySelector<HTMLElement>(this.textSelector);
        if (!textElement || !this.isBlindedText(textElement.textContent)) continue;
        const original = directOriginal && !this.isBlindedText(directOriginal)
          ? directOriginal
          : key ? this.cache.get(key) || "" : "";
        this.prepare(textElement, item, target, original);
      }
    }

    /** 변경된 요소에서 가장 가까운 채팅 한 줄을 찾아 다음 묶음 검사에 추가합니다. */
    private enqueueNode(node: Node): void {
      if (!(node instanceof HTMLElement)) return;
      const closest = node.closest<HTMLElement>(this.itemSelector);
      if (closest) this.pendingItems.add(closest);
      // 치지직의 클래스명이 바뀌어 채팅 줄을 못 찾더라도 가림막 자체는 검사합니다.
      if (!closest && (node.matches(this.blindedSelector) || node.closest(this.blindedSelector))) {
        this.pendingItems.add(node.closest<HTMLElement>(this.blindedSelector) || node);
      }
      if (node.matches(this.itemSelector)) this.pendingItems.add(node);
      node.querySelectorAll<HTMLElement>(this.itemSelector).forEach((item) => this.pendingItems.add(item));
    }

    /** 여러 채팅 변화가 한꺼번에 와도 다음 화면 그리기 전에 한 번만 처리합니다. */
    private scheduleScan(full = false): void {
      if (!isEnabled() || this.scanScheduled) return;
      if (full) this.activeContainer?.querySelectorAll<HTMLElement>(this.itemSelector).forEach((item) => this.pendingItems.add(item));
      this.scanScheduled = true;
      requestAnimationFrame(() => {
        this.scanScheduled = false;
        const items = [...this.pendingItems];
        this.pendingItems.clear();
        for (const item of items) if (item.isConnected) this.processItem(item);
      });
    }

    /** 설정에 맞춰 감시를 시작하고 기존 복구 항목의 표시 상태를 바꿉니다. */
    update(): void {
      const prepared = document.querySelectorAll<HTMLElement>('[data-chzzk-plus-blinded="ready"]');
      if (!isEnabled()) {
        prepared.forEach((element) => this.conceal(element));
        this.observer.disconnect();
        this.activeContainer = null;
        if (this.mountTimer != null) clearInterval(this.mountTimer);
        this.mountTimer = undefined;
        document.removeEventListener("mouseover", this.onMouseOver, true);
        this.pendingItems.clear();
        return;
      }
      if (this.mountTimer == null) {
        this.mountTimer = window.setInterval(() => this.attachToChatList(), 1500);
        document.addEventListener("mouseover", this.onMouseOver, { capture: true, passive: true });
      }
      this.attachToChatList();
      prepared.forEach((element) => {
        if (settings.blindedAutoRestoreEnabled) this.restore(element);
        else this.conceal(element);
      });
      this.scheduleScan(true);
    }
  }

  const restorer = new BlindedMessageRestorer();
  restorer.update();

  // 팝업 설정을 받으면 새로고침하지 않고 감시와 원문 표시 상태를 바로 바꿉니다.
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "chzzk-plus-content" || event.data.type !== "SETTINGS") return;
    const next = { ...settings, ...(event.data.settings || {}) };
    const key = `${next.enabled}:${next.blindedRestoreEnabled}:${next.blindedAutoRestoreEnabled}`;
    if (key === lastSettingsKey) return;
    lastSettingsKey = key;
    settings = next;
    restorer.update();
  });

  window.postMessage({ source: "chzzk-plus-main", type: "READY", module: "blinded" }, "*");
})();
