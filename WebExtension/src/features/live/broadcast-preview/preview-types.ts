/** 라이브 상세 API에서 미리보기 화면에 필요한 값만 정리한 자료형입니다. */
export interface PreviewEncodingTrack {
  id: string;
  path: string;
}

export interface PreviewMedia {
  id: string;
  path: string;
  tracks: PreviewEncodingTrack[];
}

export interface BroadcastPreviewData {
  channelId: string;
  href: string;
  title: string;
  channelName: string;
  category: string;
  thumbnailUrl: string;
  viewerCount: number;
  openedAt: number | null;
  restricted: boolean;
  media: PreviewMedia[];
}

/** 치지직의 `2026-07-19 18:30:00` 형식을 한국 표준시 시각으로 바꿉니다. */
export function parseBroadcastOpenedAt(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    ? `${value.trim().replace(" ", "T")}+09:00`
    : value.trim();
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** 방송 시작 후 흐른 시간을 `02:15:09` 또는 `15:09` 형태로 표시합니다. */
export function formatBroadcastUptime(openedAt: number | null, now = Date.now()): string {
  if (openedAt == null || !Number.isFinite(openedAt)) return "";
  const elapsed = Math.max(0, Math.floor((now - openedAt) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
