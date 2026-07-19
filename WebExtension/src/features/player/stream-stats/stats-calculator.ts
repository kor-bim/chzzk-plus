import type { CollectedStreamStats, StreamStatsContext } from "./stats-types";

const finite = (value: number, digits = 3): string => Number.isFinite(value) ? value.toFixed(digits) : "확인 불가";

/** 수집값을 Netflix 진단창처럼 복사하기 쉬운 고정폭 텍스트로 조립합니다. */
export function formatStreamStats(
  qualityLabel: string,
  stats: CollectedStreamStats,
  context: StreamStatsContext
): string {
  const readyLabels = ["정보 없음", "정보 확인", "현재 위치 준비", "재생 가능", "충분히 준비"];
  const networkLabels = ["비어 있음", "대기", "받는 중", "오류"];
  const playerState = stats.seeking ? "Seeking" : stats.paused ? "Paused" : "Normal";
  const bufferingState = stats.readyState < 3 ? "Buffering" : "Normal";
  const renderingState = stats.paused ? "Paused" : stats.readyState < 2 ? "Waiting" : "Playing";
  const droppedRate = stats.totalFrames > 0 ? ((stats.droppedFrames / stats.totalFrames) * 100).toFixed(3) : "0.000";
  const bitrate = stats.trackBitrateKbps == null ? "확인 불가" : `${Math.round(stats.trackBitrateKbps)} kbps`;
  const bufferRange = stats.bufferedStart == null || stats.bufferedEnd == null
    ? "확인 불가"
    : `${stats.bufferedStart.toFixed(3)}-${stats.bufferedEnd.toFixed(3)}`;

  return [
    `Version: ${context.version}`,
    `UserAgent: ${context.userAgent}`,
    "",
    `ContentId: ${context.contentId}`,
    `Position: ${finite(stats.currentTime)}`,
    `Duration: ${finite(stats.duration)}`,
    `Volume: ${Math.round(stats.volume * 100)}%`,
    `Playback Rate: ${stats.playbackRate.toFixed(2)}x`,
    "",
    `Player state: ${playerState}`,
    `Buffering state: ${bufferingState}`,
    `Rendering state: ${renderingState}`,
    "",
    `Playing bitrate (video): ${bitrate}`,
    `Selected / Rendering resolution: ${qualityLabel} / ${stats.resolution}`,
    `Buffer size in Seconds: ${stats.bufferSeconds.toFixed(3)}`,
    `Current Buffer Range: ${bufferRange}`,
    `All Buffer Ranges: ${stats.bufferedRanges}`,
    `LIVE latency: ${stats.latencySeconds == null ? "해당 없음" : `${stats.latencySeconds.toFixed(3)} sec`}`,
    "",
    `Video Track: Id: ${stats.trackId || "확인 불가"}, Codec: ${stats.codec || "확인 불가"}`,
    "Audio Track: 브라우저에서 확인 불가",
    `Framerate: ${stats.actualFps == null ? "측정 중" : stats.actualFps.toFixed(3)}`,
    `Current Dropped Frames: ${stats.droppedFramesRecent}`,
    `Total Frames: ${stats.totalFrames}`,
    `Total Dropped Frames: ${stats.droppedFrames} (${droppedRate}%)`,
    "",
    `VideoDiag: readyState=${stats.readyState}(${readyLabels[stats.readyState] || "알 수 없음"}),networkState=${stats.networkState}(${networkLabels[stats.networkState] || "알 수 없음"}),currentTime=${finite(stats.currentTime, 6)},pbRate=${stats.playbackRate},videoBuffered=${stats.bufferSeconds.toFixed(3)},videoRanges=${stats.bufferedRanges}`
  ].join("\n");
}
