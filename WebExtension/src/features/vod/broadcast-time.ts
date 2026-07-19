import type { Settings } from "../../shared/settings";
import { CP } from "../../runtime/extension-runtime";
import { readVodId } from "./video-id";

const TIME_SELECTOR = ".pzp-vod-time, .pzp-pc-vod-time, .pzp-pc__vod-time, .pzp-pc__bottom-time, .pzp-vod-time__current-time, [role=timer]";
const PROGRESS_SELECTOR = ".pzp-pc-progress-slider, .pzp-vod-progress, .pzp-pc__progress-slider, [class*=\"progress-slider\"]";
const TARGET_SELECTOR = `${TIME_SELECTOR}, ${PROGRESS_SELECTOR}`;

/** 다시보기 재생 시간을 실제 방송 당시 날짜와 시각으로 바꿔 툴팁에 표시합니다. */
export class VodBroadcastTime {
  readonly id = "vod-broadcast-time";
  #enabled = false;
  #videoId: string | null = null;
  #broadcastStartedAt: number | null = null;
  #loading: Promise<void> | null = null;
  #target: HTMLElement | null = null;
  #pointerX: number | null = null;
  #tooltip: HTMLElement | null = null;

  readonly #onMouseMove = (event: MouseEvent): void => {
    if (!this.#enabled || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>(TARGET_SELECTOR);
    if (!target || !readVodId()) return;
    this.#target = target;
    this.#pointerX = event.clientX;
    void this.#show();
  };
  readonly #onMouseOut = (event: MouseEvent): void => {
    if (!this.#target) return;
    if (event.relatedTarget instanceof Node && this.#target.contains(event.relatedTarget)) return;
    this.#hide();
  };

  start(): void {
    document.addEventListener("mousemove", this.#onMouseMove, true);
    document.addEventListener("mouseout", this.#onMouseOut, true);
  }

  update(settings: Readonly<Settings>): void {
    this.#enabled = settings.enabled && settings.vodBroadcastTimeEnabled;
    if (!this.#enabled) this.#hide();
  }

  scan(): void {
    const nextId = readVodId();
    if (nextId === this.#videoId) return;
    this.#videoId = nextId;
    this.#broadcastStartedAt = null;
    this.#loading = null;
    this.#hide();
  }

  async #loadStartTime(): Promise<void> {
    const videoId = readVodId();
    if (!videoId || this.#broadcastStartedAt || this.#loading) return this.#loading ?? Promise.resolve();
    this.#videoId = videoId;
    this.#loading = fetch(`https://api.chzzk.naver.com/service/v2/videos/${videoId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`영상 정보 요청 실패 (${response.status})`);
        const data = await response.json() as { content?: { liveOpenDate?: string; videoPublishedAt?: string } };
        const raw = data.content?.liveOpenDate || data.content?.videoPublishedAt;
        const value = raw ? new Date(raw).getTime() : NaN;
        this.#broadcastStartedAt = Number.isFinite(value) ? value : null;
      })
      .catch((error) => CP.Debug.error("VOD", "방송 시각을 불러오지 못했습니다.", error))
      .finally(() => { this.#loading = null; });
    return this.#loading;
  }

  async #show(): Promise<void> {
    await this.#loadStartTime();
    const video = CP.findVideo();
    if (!this.#enabled || !this.#target || !video || !this.#broadcastStartedAt) return;
    const rect = this.#target.getBoundingClientRect();
    const isProgress = this.#target.matches(PROGRESS_SELECTOR);
    const ratio = isProgress && rect.width > 0 && this.#pointerX != null
      ? Math.min(1, Math.max(0, (this.#pointerX - rect.left) / rect.width))
      : null;
    const seconds = ratio == null || !Number.isFinite(video.duration)
      ? video.currentTime
      : video.duration * ratio;
    const date = new Date(this.#broadcastStartedAt + seconds * 1000);
    const tooltip = this.#tooltip ?? document.createElement("div");
    tooltip.id = "chzzk-plus-broadcast-time";
    tooltip.textContent = date.toLocaleString("ko-KR", {
      year: "2-digit", month: "2-digit", day: "2-digit",
      hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true
    });
    if (!tooltip.isConnected) document.body.appendChild(tooltip);
    this.#tooltip = tooltip;
    tooltip.style.left = `${isProgress && this.#pointerX != null ? this.#pointerX : rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 8}px`;
    tooltip.classList.add("show");
  }

  #hide(): void {
    this.#target = null;
    this.#pointerX = null;
    this.#tooltip?.classList.remove("show");
  }

  stop(): void {
    document.removeEventListener("mousemove", this.#onMouseMove, true);
    document.removeEventListener("mouseout", this.#onMouseOut, true);
    this.#tooltip?.remove();
    this.#tooltip = null;
  }
}
