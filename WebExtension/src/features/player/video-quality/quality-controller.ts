import type { VideoTrack } from "./quality-detector";

export function isLowLatencyTrack(track?: VideoTrack): boolean {
  return /\.lowlatency$|_lowlatency/i.test(String(track?.id || ""));
}

/** 선호 해상도 이하에서 가장 좋은 화질을 고르고 현재 저지연 방식을 유지합니다. */
export function choosePreferredTrack(
  tracks: VideoTrack[], preferred: number, preserveLowLatency: boolean
): VideoTrack | null {
  const playable = tracks.filter((track) => Number(track.height) > 0 && String(track.label || "").toUpperCase() !== "ABR");
  if (!playable.length) return null;
  const exact = playable.filter((track) => Number(track.height) === preferred);
  const lower = Math.max(0, ...playable.map((track) => Number(track.height)).filter((height) => height <= preferred));
  const highest = Math.max(...playable.map((track) => Number(track.height)));
  const sameHeight = exact.length ? exact : playable.filter((track) => Number(track.height) === (lower || highest));
  const sameLatency = sameHeight.filter((track) => isLowLatencyTrack(track) === preserveLowLatency);
  return (sameLatency.length ? sameLatency : sameHeight)
    .sort((a, b) => Number(b.videoBitrate || b.bitrate || 0) - Number(a.videoBitrate || a.bitrate || 0))[0] ?? null;
}
