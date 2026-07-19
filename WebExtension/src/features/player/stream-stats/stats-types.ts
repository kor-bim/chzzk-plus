export interface CollectedStreamStats {
  resolution: string;
  trackBitrateKbps: number | null;
  actualFps: number | null;
  bufferSeconds: number;
  latencySeconds: number | null;
  droppedFrames: number;
  droppedFramesRecent: number;
  totalFrames: number;
  playbackRate: number;
  volume: number;
  readyState: number;
  networkState: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  seeking: boolean;
  bufferedStart: number | null;
  bufferedEnd: number | null;
  bufferedRanges: string;
  trackId: string | null;
  codec: string | null;
}

export interface StreamStatsContext {
  version: string;
  contentId: string;
  userAgent: string;
}
