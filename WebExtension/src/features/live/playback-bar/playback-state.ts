export const LIVE_EPSILON = 3.5;

export interface PlaybackControls {
  slide: HTMLElement; progress: HTMLElement; thumb: HTMLElement; position: HTMLElement;
  button: HTMLButtonElement; tip: HTMLElement; line: HTMLElement;
}

export interface StoredDisplay { display: string; priority: string; }

interface PlaybackEdges { start: number; end: number; ok: boolean; }

export function findLiveVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(".pzp-pc video.webplayer-internal-video, video.webplayer-internal-video, .pzp-pc video, video");
}

export function readPlaybackEdges(video: HTMLVideoElement): PlaybackEdges {
  const read = (ranges: TimeRanges): { start: number; end: number } | null => {
    if (!ranges.length) return null;
    try {
      const start = ranges.start(0); const end = ranges.end(ranges.length - 1);
      return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
    } catch { return null; }
  };
  const range = read(video.seekable) || read(video.buffered);
  if (range) return { ...range, ok: true };
  const end = Number.isFinite(video.duration) ? video.duration : video.currentTime;
  return { start: 0, end: Number.isFinite(end) ? end : 0, ok: false };
}

/** 실시간과의 차이를 `15초 전`, `1분 20초 전`처럼 표시합니다. */
export function formatBehind(seconds: number): string {
  const value = Math.max(0, Math.round(Math.abs(Number.isFinite(seconds) ? seconds : 0)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 전`;
  if (minutes > 0) return `${minutes}분${secs ? ` ${secs}초` : ""} 전`;
  return `${secs}초 전`;
}
