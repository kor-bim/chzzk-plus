import type { Settings } from "../../../shared/settings";
import { LiveDetailClient } from "./live-detail-client";
import { BroadcastPreviewCard } from "./preview-card";
import { findBroadcastHoverTarget, type BroadcastHoverTarget } from "./preview-target";

const HIDE_DELAY_MS = 140;

/** 사이드바의 라이브 카드에 썸네일·영상·업타임 미리보기를 붙입니다. */
export class BroadcastPreview {
  readonly id = "broadcast-preview";
  readonly #client = new LiveDetailClient();
  #card: BroadcastPreviewCard | null = null;
  #enabled = false;
  #started = false;
  #activeChannelId: string | null = null;
  #activeRegion: HTMLElement | null = null;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #request: AbortController | null = null;

  readonly #onPointerOver = (event: PointerEvent): void => {
    if (!this.#enabled) return;
    const target = findBroadcastHoverTarget(event.target);
    if (!target) return;
    if (target.channelId === this.#activeChannelId) {
      this.#activeRegion = target.region;
      this.#cancelHide();
      return;
    }
    this.#begin(target);
  };

  readonly #onPointerOut = (event: PointerEvent): void => {
    if (!this.#activeRegion) return;
    const related = event.relatedTarget;
    if (related instanceof Node && (this.#activeRegion.contains(related) || this.#card?.root.contains(related))) return;
    this.#scheduleHide();
  };

  readonly #onViewportChanged = (): void => this.#hide();

  start(): void {
    if (this.#started || !this.#enabled) return;
    this.#started = true;
    document.addEventListener("pointerover", this.#onPointerOver, { passive: true });
    document.addEventListener("pointerout", this.#onPointerOut, { passive: true });
    document.addEventListener("scroll", this.#onViewportChanged, { passive: true, capture: true });
    window.addEventListener("resize", this.#onViewportChanged, { passive: true });
  }

  update(settings: Readonly<Settings>): void {
    const enabled = settings.enabled && settings.broadcastPreviewEnabled;
    if (enabled) {
      this.#enabled = true;
      this.start();
    } else if (this.#enabled || this.#started) {
      this.stop();
    }
  }

  stop(): void {
    this.#enabled = false;
    this.#started = false;
    document.removeEventListener("pointerover", this.#onPointerOver);
    document.removeEventListener("pointerout", this.#onPointerOut);
    document.removeEventListener("scroll", this.#onViewportChanged, true);
    window.removeEventListener("resize", this.#onViewportChanged);
    this.#hide();
    this.#card?.remove();
    this.#card = null;
    this.#client.clear();
  }

  #getCard(): BroadcastPreviewCard {
    this.#card ??= new BroadcastPreviewCard(() => this.#cancelHide(), () => this.#scheduleHide());
    return this.#card;
  }

  #begin(target: BroadcastHoverTarget): void {
    this.#cancelWork();
    this.#activeChannelId = target.channelId;
    this.#activeRegion = target.region;
    // 사이드바는 항목이 작으므로 별도 대기 없이 정보 조회와 카드 표시를 시작합니다.
    void this.#show(target);
  }

  async #show(target: BroadcastHoverTarget): Promise<void> {
    if (!this.#enabled || this.#activeChannelId !== target.channelId) return;
    const card = this.#getCard();
    card.showPending(target.anchor, {
      href: target.href,
      thumbnailUrl: target.thumbnailUrl,
      title: target.fallbackTitle
    });
    const request = new AbortController();
    this.#request = request;
    try {
      const data = await this.#client.get(target.channelId, request.signal);
      if (request.signal.aborted || this.#activeChannelId !== target.channelId) return;
      if (!data) {
        this.#hide();
        return;
      }
      card.render(target.anchor, data);
      // API 응답을 받은 뒤 추가로 기다리지 않고 곧바로 무음 재생을 요청합니다.
      if (this.#enabled && this.#activeChannelId === target.channelId) card.play(data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // 방송이 끝났거나 API가 실패했을 때 로딩 카드가 계속 남지 않도록 닫습니다.
        if (this.#activeChannelId === target.channelId) this.#hide();
      }
    } finally {
      if (this.#request === request) this.#request = null;
    }
  }

  #scheduleHide(): void {
    this.#cancelHide();
    this.#hideTimer = setTimeout(() => this.#hide(), HIDE_DELAY_MS);
  }

  #cancelHide(): void {
    clearTimeout(this.#hideTimer);
    this.#hideTimer = undefined;
  }

  #cancelWork(): void {
    this.#request?.abort();
    this.#request = null;
    this.#cancelHide();
  }

  #hide(): void {
    this.#cancelWork();
    this.#card?.hide();
    this.#activeChannelId = null;
    this.#activeRegion = null;
  }
}
