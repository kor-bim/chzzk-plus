import { describe, expect, it } from "vitest";
import { formatStreamStats } from "../src/features/player/stream-stats/stats-calculator";

describe("formatStreamStats", () => {
  it("labels track bitrate separately from measured FPS", () => {
    const result = formatStreamStats("1080p", {
      resolution: "1920 × 1080", trackBitrateKbps: 8000, actualFps: 60,
      bufferSeconds: 3.25, latencySeconds: 1.2, droppedFrames: 2,
      droppedFramesRecent: 1, totalFrames: 1000, playbackRate: 1,
      volume: 0.5, readyState: 4, networkState: 2, currentTime: 15.315,
      duration: 2806.345, paused: false, seeking: false, bufferedStart: 0,
      bufferedEnd: 50.717, bufferedRanges: "0.000-50.717", trackId: "1080p",
      codec: "avc1.640028"
    }, { version: "0.1.0", contentId: "81917996", userAgent: "Safari" });
    expect(result).toContain("Playing bitrate (video): 8000 kbps");
    expect(result).toContain("Framerate: 60.000");
    expect(result).toContain("Current Dropped Frames: 1");
    expect(result).toContain("ContentId: 81917996");
  });
});
