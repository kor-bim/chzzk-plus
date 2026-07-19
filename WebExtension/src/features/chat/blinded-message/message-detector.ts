export interface ChatMessage { key?: string; messageId?: string; originalContent?: unknown; content?: unknown; }
export type ReactCarrier = HTMLElement & Record<string, any>;

export function normalizeContent(content: unknown): string {
  if (Array.isArray(content)) return content.map((item: any) => {
    if (typeof item === "string") return item;
    if (item?.type === "text") return item.value || "";
    if (item?.type === "emoji") return `{${item.name || "이모티콘"}}`;
    return "";
  }).join("");
  return content == null ? "" : String(content);
}

export function isBlindedText(text: string | null | undefined): boolean {
  return /블라인드|클린봇|운영정책에 의해|가려진 메시지/.test(text || "");
}

function findChatMessage(value: any, depth = 0, visited = new WeakSet<object>()): ChatMessage | null {
  if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) return null;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) { const found = findChatMessage(item, depth + 1, visited); if (found) return found; }
    return null;
  }
  if (value.chatMessage?.key || value.chatMessage?.content || value.chatMessage?.originalContent) return value.chatMessage;
  if ((value.key || value.messageId) && (value.originalContent || value.content)) return value;
  for (const key of ["props", "children", "data", "message", "item", "memoizedProps", "pendingProps"]) {
    const found = findChatMessage(value[key], depth + 1, visited); if (found) return found;
  }
  return null;
}

export function getReactMessage(element: HTMLElement): ChatMessage | null {
  let cursor: ReactCarrier | null = element as ReactCarrier;
  for (let parentDepth = 0; cursor && parentDepth < 5; parentDepth += 1, cursor = cursor.parentElement as ReactCarrier | null) {
    for (const key of Object.getOwnPropertyNames(cursor)) {
      if (key.startsWith("__reactProps$")) { const direct = findChatMessage(cursor[key]); if (direct) return direct; }
      if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
      let fiber = cursor[key];
      for (let level = 0; fiber && level < 16; level += 1, fiber = fiber.return) {
        const found = findChatMessage(fiber.memoizedProps) || findChatMessage(fiber.pendingProps);
        if (found) return found;
      }
    }
  }
  return null;
}

export function getDirectReactMessage(element: HTMLElement): ChatMessage | null {
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
