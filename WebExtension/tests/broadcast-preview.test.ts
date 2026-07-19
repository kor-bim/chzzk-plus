import { describe, expect, it } from "vitest";
import { normalizeLiveDetail } from "../src/features/live/broadcast-preview/live-detail-client";
import { choosePreviewStream, selectPreviewStream } from "../src/features/live/broadcast-preview/preview-video";
import { formatBroadcastUptime, parseBroadcastOpenedAt } from "../src/features/live/broadcast-preview/preview-types";
import { extractLiveChannelId } from "../src/features/live/broadcast-preview/preview-target";

describe("broadcast preview", () => {
  it("normalizes thumbnail, uptime and playback data", () => {
    const playback = JSON.stringify({ media: [
      {
        mediaId: "LLHLS", path: "low-latency-master.m3u8",
        encodingTrack: [{ encodingTrackId: "720p", path: "llhls-720.m3u8" }]
      },
      {
        mediaId: "HLS", path: "master.m3u8",
        encodingTrack: [{ encodingTrackId: "1080p60", path: "hls-1080.m3u8" }]
      }
    ] });
    const result = normalizeLiveDetail("a".repeat(32), {
      content: {
        liveTitle: "테스트 방송", liveImageUrl: "https://image/{type}.jpg",
        concurrentUserCount: 1234, openDate: "2026-07-19 18:00:00",
        liveCategoryValue: "게임", channel: { channelName: "테스트 채널" },
        livePlaybackJson: playback
      }
    });
    expect(result).toMatchObject({
      title: "테스트 방송", thumbnailUrl: "https://image/1080.jpg",
      viewerCount: 1234, channelName: "테스트 채널"
    });
    expect(choosePreviewStream(result?.media ?? [])).toBe("hls-1080.m3u8");
    expect(selectPreviewStream(result?.media ?? [])).toMatchObject({
      mediaId: "HLS",
      trackId: "1080p60",
      requestedHeight: 1080
    });
  });

  it("formats elapsed broadcast time", () => {
    const start = parseBroadcastOpenedAt("2026-07-19 18:00:00");
    expect(start).not.toBeNull();
    expect(formatBroadcastUptime(start, (start as number) + 7_445_000)).toBe("02:04:05");
  });

  it("recognizes only live channel links", () => {
    const id = "04b9076004dfe8cb119835eb28dcc747";
    expect(extractLiveChannelId(`/live/${id}`)).toBe(id);
    expect(extractLiveChannelId(`https://chzzk.naver.com/live/${id}`)).toBe(id);
    expect(extractLiveChannelId(`/${id}`)).toBeNull();
    expect(extractLiveChannelId("/live/not-a-channel")).toBeNull();
  });

  it("marks paid and protected broadcasts as thumbnail-only", () => {
    const result = normalizeLiveDetail("a".repeat(32), {
      content: {
        liveTitle: "보호된 방송",
        watchPartyTag: "2026북중미월드컵",
        adParameter: { tag: "worldcup" },
        channel: {}
      }
    });
    expect(result?.restricted).toBe(true);
  });
});
