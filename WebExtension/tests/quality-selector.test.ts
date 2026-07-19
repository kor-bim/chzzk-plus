import { describe, expect, it } from "vitest";
import { choosePreferredTrack } from "../src/features/player/video-quality/quality-controller";

describe("choosePreferredTrack", () => {
  const tracks = [
    { id: "1080.lowlatency", height: 1080, videoBitrate: 8000 },
    { id: "720.lowlatency", height: 720, videoBitrate: 4500 },
    { id: "720", height: 720, videoBitrate: 5000 }
  ];

  it("uses the closest lower resolution when an exact one is unavailable", () => {
    expect(choosePreferredTrack(tracks, 900, true)?.height).toBe(720);
  });

  it("preserves the current low-latency mode", () => {
    expect(choosePreferredTrack(tracks, 720, true)?.id).toBe("720.lowlatency");
    expect(choosePreferredTrack(tracks, 720, false)?.id).toBe("720");
  });
});
