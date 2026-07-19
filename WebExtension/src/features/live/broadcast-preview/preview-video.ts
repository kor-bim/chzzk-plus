import type { BroadcastPreviewData, PreviewMedia } from "./preview-types";

export interface PreviewStreamSelection {
  path: string;
  mediaId: string;
  trackId: string;
  requestedHeight: number | null;
}

function mediaRank(id: string): number {
  return id.toUpperCase() === "LLHLS" ? 0 : id.toUpperCase() === "HLS" ? 1 : 2;
}

function trackHeight(id: string): number {
  const height = Number(id.match(/(\d{3,4})p?/i)?.[1]);
  return Number.isFinite(height) ? height : 0;
}

function sourceLabel(path: string): string {
  try {
    const url = new URL(path);
    return `${url.origin}${url.pathname}`;
  } catch {
    return path.split("?")[0] || path;
  }
}

/** 모든 HLS 목록을 함께 비교해 가장 높은 1080p 이하 트랙과 출처를 선택합니다. */
export function selectPreviewStream(media: readonly PreviewMedia[]): PreviewStreamSelection | null {
  const candidates = media.flatMap((item) => item.tracks.map((candidate) => ({
    path: candidate.path,
    height: trackHeight(candidate.id),
    mediaRank: mediaRank(item.id),
    mediaId: item.id,
    trackId: candidate.id
  }))).filter((candidate) => candidate.path && candidate.height > 0);
  const capped = candidates.filter((candidate) => candidate.height <= 1080);
  const selectable = capped.length ? capped : candidates;
  selectable.sort((left, right) => right.height - left.height || left.mediaRank - right.mediaRank);
  const selected = selectable[0];
  if (selected?.path) {
    return {
      path: selected.path,
      mediaId: selected.mediaId,
      trackId: selected.trackId,
      requestedHeight: selected.height
    };
  }

  const fallback = [...media]
    .sort((left, right) => mediaRank(left.id) - mediaRank(right.id))
    .find((item) => item.path);
  return fallback ? {
    path: fallback.path,
    mediaId: fallback.id,
    trackId: "master",
    requestedHeight: null
  } : null;
}

/** 테스트와 단순 호출부에서 선택된 영상 주소만 확인할 때 사용합니다. */
export function choosePreviewStream(media: readonly PreviewMedia[]): string {
  return selectPreviewStream(media)?.path || "";
}

/** Safari의 기본 HLS 재생기를 사용해 한 개의 무음 미리보기 영상만 관리합니다. */
export class BroadcastPreviewVideo {
  readonly #video: HTMLVideoElement;
  #selection: PreviewStreamSelection | null = null;
  #lastResolution = "";

  constructor(video: HTMLVideoElement) {
    this.#video = video;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    const reportResolution = (event: string): void => {
      if (!this.#selection) return;
      const resolution = `${video.videoWidth}x${video.videoHeight}`;
      if (event === "resize" && resolution === this.#lastResolution) return;
      this.#lastResolution = resolution;
      console.info(`[CHZZK Plus:Preview] ${event}`, {
        requestedTrack: this.#selection.trackId,
        requestedHeight: this.#selection.requestedHeight,
        mediaType: this.#selection.mediaId,
        decodedResolution: resolution,
        readyState: video.readyState,
        currentTime: Number(video.currentTime.toFixed(3)),
        source: sourceLabel(video.currentSrc || this.#selection.path)
      });
    };
    // `playing`은 첫 화면이 그려지기 전에 올 수 있어 실제 재생 시간이 움직인 뒤 노출합니다.
    const revealFirstFrame = (): void => {
      if (video.currentTime > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (!video.classList.contains("is-playing")) {
          video.classList.add("is-playing");
          reportResolution("첫 화면 표시");
        }
      }
    };
    video.addEventListener("playing", revealFirstFrame);
    video.addEventListener("timeupdate", revealFirstFrame);
    video.addEventListener("loadedmetadata", () => reportResolution("메타데이터 로드"));
    video.addEventListener("resize", () => reportResolution("해상도 변경"));
    video.addEventListener("error", () => {
      video.classList.remove("is-playing");
      console.warn("[CHZZK Plus:Preview] 영상 재생 오류", {
        code: video.error?.code,
        message: video.error?.message,
        networkState: video.networkState,
        source: this.#selection ? sourceLabel(this.#selection.path) : "없음"
      });
    });
  }

  play(data: BroadcastPreviewData): void {
    if (data.restricted) {
      console.info("[CHZZK Plus:Preview] 보호된 방송이라 썸네일만 표시", { channelId: data.channelId });
      return;
    }
    const selection = selectPreviewStream(data.media);
    const hlsSupport = this.#video.canPlayType("application/vnd.apple.mpegurl");
    console.info("[CHZZK Plus:Preview] 스트림 선택", {
      channelId: data.channelId,
      offeredTracks: data.media.map((item) => ({
        mediaType: item.id,
        tracks: item.tracks.map((track) => track.id)
      })),
      selected: selection ? {
        mediaType: selection.mediaId,
        track: selection.trackId,
        requestedHeight: selection.requestedHeight,
        source: sourceLabel(selection.path)
      } : null,
      nativeHlsSupport: hlsSupport || "없음"
    });
    if (!selection || !hlsSupport) return;
    this.stop();
    this.#selection = selection;
    this.#video.src = selection.path;
    this.#video.load();
    void this.#video.play().catch((error) => {
      this.#video.classList.remove("is-playing");
      console.warn("[CHZZK Plus:Preview] 자동 재생 실패", error);
    });
  }

  /** 호버가 끝나면 네트워크 다운로드와 디코딩을 즉시 중단합니다. */
  stop(): void {
    this.#video.pause();
    this.#video.classList.remove("is-playing");
    this.#video.removeAttribute("src");
    this.#video.load();
    this.#selection = null;
    this.#lastResolution = "";
  }
}
