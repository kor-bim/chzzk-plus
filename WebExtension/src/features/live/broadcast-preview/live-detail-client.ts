import { parseBroadcastOpenedAt, type BroadcastPreviewData, type PreviewMedia } from "./preview-types";
import { MESSAGE } from "../../../shared/messages";

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_SIZE = 40;

interface CacheEntry {
  data: BroadcastPreviewData;
  expiresAt: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function thumbnail(value: unknown): string {
  // 카드도 Retina 화면에서는 실제 픽셀이 두 배 필요하므로 가장 큰 썸네일을 요청합니다.
  return text(value).replaceAll("{type}", "1080");
}

function parseMedia(value: unknown): PreviewMedia[] {
  const playback = (() => {
    try {
      return record(JSON.parse(text(value) || "{}"));
    } catch {
      return null;
    }
  })();
  if (!Array.isArray(playback?.media)) return [];

  return playback.media.flatMap((rawMedia) => {
    const media = record(rawMedia);
    if (!media) return [];
    const path = text(media.path);
    const id = text(media.mediaId);
    const tracks = Array.isArray(media.encodingTrack)
      ? media.encodingTrack.flatMap((rawTrack) => {
        const track = record(rawTrack);
        const trackPath = text(track?.path);
        if (!track || !trackPath) return [];
        return [{ id: text(track.encodingTrackId), path: trackPath }];
      })
      : [];
    return path || tracks.length ? [{ id, path, tracks }] : [];
  });
}

interface LiveDetailResponse {
  ok?: boolean;
  data?: unknown;
}

/** API 호출은 Safari의 교차 출처 제한을 피하도록 백그라운드에 맡깁니다. */
async function requestLiveDetail(channelId: string, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new DOMException("요청이 취소되었습니다.", "AbortError");
  const response = await browser.runtime.sendMessage({
    type: MESSAGE.liveDetail,
    channelId
  }) as LiveDetailResponse | undefined;
  if (signal.aborted) throw new DOMException("요청이 취소되었습니다.", "AbortError");
  return response?.ok ? response.data : null;
}

/** API 전체 응답에서 카드에 쓸 안전한 값만 꺼냅니다. */
export function normalizeLiveDetail(channelId: string, value: unknown): BroadcastPreviewData | null {
  const response = record(value);
  const content = record(response?.content);
  if (!content) return null;
  const channel = record(content.channel);
  const media = parseMedia(content.livePlaybackJson);
  const restricted = Boolean(
    content.paidProduct || content.paidProductId || content.watchPartyPaidProductId
    || content.watchPartyType === "RS"
    || content.watchPartyTag === "2026북중미월드컵"
    || record(content.adParameter)?.tag === "worldcup"
  );
  return {
    channelId,
    href: `/live/${channelId}`,
    title: text(content.liveTitle),
    channelName: text(channel?.channelName),
    category: text(content.liveCategoryValue),
    thumbnailUrl: thumbnail(content.liveImageUrl),
    viewerCount: count(content.concurrentUserCount),
    openedAt: parseBroadcastOpenedAt(content.openDate),
    restricted,
    media
  };
}

/** 같은 방송을 반복해서 가리킬 때 API를 다시 부르지 않는 작은 메모리 캐시입니다. */
export class LiveDetailClient {
  readonly #cache = new Map<string, CacheEntry>();

  async get(channelId: string, signal: AbortSignal): Promise<BroadcastPreviewData | null> {
    const now = Date.now();
    const cached = this.#cache.get(channelId);
    if (cached && cached.expiresAt > now) return cached.data;
    if (cached) this.#cache.delete(channelId);

    const data = normalizeLiveDetail(channelId, await requestLiveDetail(channelId, signal));
    if (!data) return null;

    this.#cache.set(channelId, { data, expiresAt: now + CACHE_TTL_MS });
    while (this.#cache.size > MAX_CACHE_SIZE) {
      const oldestKey = this.#cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.#cache.delete(oldestKey);
    }
    return data;
  }

  clear(): void {
    this.#cache.clear();
  }
}
