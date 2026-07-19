export interface BroadcastHoverTarget {
  channelId: string;
  href: string;
  anchor: HTMLAnchorElement;
  region: HTMLElement;
  thumbnailUrl: string;
  fallbackTitle: string;
}

export function extractLiveChannelId(href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, "https://chzzk.naver.com").pathname.match(/^\/live\/([a-f0-9]{32})(?:\/|$)/i)?.[1] || null;
  } catch {
    return null;
  }
}

function imageUrl(root: ParentNode): string {
  const image = root.querySelector<HTMLImageElement>("img");
  return image?.currentSrc || image?.src || image?.getAttribute("data-src") || "";
}

/** 포인터 아래 요소가 사이드바의 실제 라이브 방송 카드인지 확인합니다. */
export function findBroadcastHoverTarget(value: EventTarget | null): BroadcastHoverTarget | null {
  if (!(value instanceof Element) || value.closest(".chzzk-plus-broadcast-preview")) return null;
  const link = value.closest<HTMLAnchorElement>('a[href*="/live/"]');
  if (!link || !link.closest("#sidebar")) return null;
  const channelId = extractLiveChannelId(link.getAttribute("href"));
  if (!channelId) return null;

  const anchor = link;
  const region = anchor.closest<HTMLElement>("li, article") || anchor.parentElement || anchor;
  const fallbackTitle = (region.querySelector("strong")?.textContent || link.textContent || "").trim();
  return {
    channelId,
    href: `/live/${channelId}`,
    anchor,
    region,
    thumbnailUrl: imageUrl(anchor) || imageUrl(region),
    fallbackTitle
  };
}
