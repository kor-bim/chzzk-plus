import type { Settings } from "../../../shared/settings";
import { CP } from "../../../runtime/extension-runtime";
import { readVodId } from "../video-id";
import { VodPositionStorage } from "./position-storage";

/** 다시보기마다 마지막 위치를 기억하고 다음 방문 때 한 번만 이어서 재생합니다. */
export class VodResumePlayback {
  readonly id = "vod-resume-playback";
  readonly #storage = new VodPositionStorage();
  #enabled = false;
  #video: HTMLVideoElement | null = null;
  #videoId: string | null = null;
  #restoring = false;
  #restoredKey = "";
  #lastSavedAt = 0;

  readonly #onReady = (): void => { void this.#restore(); };
  readonly #onTimeUpdate = (): void => {
    if (Date.now() - this.#lastSavedAt >= 10_000) void this.#save();
  };
  readonly #onPause = (): void => { void this.#save(); };
  readonly #onPageHide = (): void => { void this.#save(); };

  start(): void {
    addEventListener("pagehide", this.#onPageHide);
  }

  update(settings: Readonly<Settings>): void {
    const nextEnabled = settings.enabled && settings.vodResumeEnabled;
    if (this.#enabled && !nextEnabled) void this.#save();
    this.#enabled = nextEnabled;
    if (!this.#enabled) this.#detach();
  }

  scan(): void {
    if (!this.#enabled) return;
    const videoId = readVodId();
    const video = videoId ? CP.findVideo() : null;
    if (!video || !videoId) {
      this.#detach();
      return;
    }
    if (video === this.#video && videoId === this.#videoId) return;
    this.#detach();
    this.#video = video;
    this.#videoId = videoId;
    video.addEventListener("loadedmetadata", this.#onReady);
    video.addEventListener("canplay", this.#onReady, { once: true });
    video.addEventListener("timeupdate", this.#onTimeUpdate, { passive: true });
    video.addEventListener("pause", this.#onPause, { passive: true });
    if (video.readyState >= 1) void this.#restore();
  }

  async #restore(): Promise<void> {
    const video = this.#video;
    const videoId = this.#videoId;
    if (!this.#enabled || !video || !videoId || !Number.isFinite(video.duration)) return;
    const key = `${videoId}:${video.currentSrc}`;
    if (this.#restoredKey === key || video.currentTime > 10) return;
    this.#restoredKey = key;
    const saved = await this.#storage.get(videoId);
    if (!this.#enabled || video !== this.#video || videoId !== this.#videoId
      || !saved || saved.position >= video.duration - 30) return;
    this.#restoring = true;
    try {
      video.currentTime = Math.min(saved.position, video.duration - 30);
      CP.Toast.show(`${CP.formatTime(saved.position)}부터 이어봅니다.`);
    } finally {
      setTimeout(() => { this.#restoring = false; }, 500);
    }
  }

  async #save(): Promise<void> {
    const video = this.#video;
    const videoId = this.#videoId;
    if (!this.#enabled || this.#restoring || !video || !videoId || !Number.isFinite(video.currentTime)) return;
    this.#lastSavedAt = Date.now();
    await this.#storage.save(videoId, video.currentTime, video.duration);
  }

  #detach(): void {
    const video = this.#video;
    if (video) {
      video.removeEventListener("loadedmetadata", this.#onReady);
      video.removeEventListener("canplay", this.#onReady);
      video.removeEventListener("timeupdate", this.#onTimeUpdate);
      video.removeEventListener("pause", this.#onPause);
    }
    this.#video = null;
    this.#videoId = null;
  }

  stop(): void {
    void this.#save();
    this.#detach();
    removeEventListener("pagehide", this.#onPageHide);
  }
}
