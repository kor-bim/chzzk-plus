import { formatBroadcastUptime, type BroadcastPreviewData } from "./preview-types";
import { BroadcastPreviewVideo } from "./preview-video";

interface PendingPreview {
  href: string;
  thumbnailUrl: string;
  title: string;
}

/** 화면 전체에서 재사용하는 단 하나의 썸네일·영상 미리보기 카드입니다. */
export class BroadcastPreviewCard {
  readonly root: HTMLElement;
  readonly #link: HTMLAnchorElement;
  readonly #image: HTMLImageElement;
  readonly #title: HTMLElement;
  readonly #channel: HTMLElement;
  readonly #viewers: HTMLElement;
  readonly #uptime: HTMLElement;
  readonly #category: HTMLElement;
  readonly #videoPlayer: BroadcastPreviewVideo;
  #uptimeTimer: ReturnType<typeof setInterval> | undefined;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(onEnter: () => void, onLeave: () => void) {
    const root = document.createElement("article");
    root.className = "chzzk-plus-broadcast-preview";
    root.innerHTML = `
      <a class="chzzk-plus-preview-link" href="/" aria-label="방송으로 이동">
        <div class="chzzk-plus-preview-media">
          <img alt="" decoding="async">
          <video muted autoplay playsinline preload="auto"></video>
          <span class="chzzk-plus-preview-live"><i></i>LIVE</span>
          <span class="chzzk-plus-preview-viewers"></span>
        </div>
        <div class="chzzk-plus-preview-info">
          <strong class="chzzk-plus-preview-title"></strong>
          <div class="chzzk-plus-preview-meta">
            <span class="chzzk-plus-preview-channel"></span>
            <span class="chzzk-plus-preview-uptime"></span>
            <span class="chzzk-plus-preview-category"></span>
          </div>
        </div>
      </a>`;
    const required = <T extends Element>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`방송 미리보기 요소를 만들지 못했습니다: ${selector}`);
      return element;
    };
    this.root = root;
    this.#link = required(".chzzk-plus-preview-link");
    this.#image = required("img");
    this.#image.addEventListener("load", () => {
      const rect = this.#image.getBoundingClientRect();
      console.info("[CHZZK Plus:Preview] 썸네일 로드", {
        naturalResolution: `${this.#image.naturalWidth}x${this.#image.naturalHeight}`,
        displayedSize: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        source: this.#safeSource(this.#image.currentSrc || this.#image.src)
      });
    });
    this.#image.addEventListener("error", () => {
      console.warn("[CHZZK Plus:Preview] 썸네일 로드 실패", {
        source: this.#safeSource(this.#image.currentSrc || this.#image.src)
      });
    });
    this.#title = required(".chzzk-plus-preview-title");
    this.#channel = required(".chzzk-plus-preview-channel");
    this.#viewers = required(".chzzk-plus-preview-viewers");
    this.#uptime = required(".chzzk-plus-preview-uptime");
    this.#category = required(".chzzk-plus-preview-category");
    this.#videoPlayer = new BroadcastPreviewVideo(required("video"));
    root.addEventListener("mouseenter", onEnter);
    root.addEventListener("mouseleave", onLeave);
    document.body.appendChild(root);
  }

  showPending(target: HTMLElement, pending: PendingPreview): void {
    clearTimeout(this.#hideTimer);
    this.#videoPlayer.stop();
    this.#stopUptime();
    this.#link.href = pending.href;
    this.#title.textContent = pending.title || "방송 정보를 불러오는 중";
    this.#channel.textContent = "";
    this.#viewers.textContent = "";
    this.#uptime.textContent = "";
    this.#category.textContent = "";
    this.#setImage(pending.thumbnailUrl);
    this.#position(target);
  }

  render(target: HTMLElement, data: BroadcastPreviewData): void {
    this.#link.href = data.href;
    this.#title.textContent = data.title || "제목 없는 방송";
    this.#channel.textContent = data.channelName;
    this.#viewers.textContent = data.viewerCount ? `${data.viewerCount.toLocaleString()}명` : "";
    this.#category.textContent = data.category;
    this.#setImage(data.thumbnailUrl || this.#image.src);
    this.#startUptime(data.openedAt);
    this.#position(target);
  }

  play(data: BroadcastPreviewData): void {
    this.#videoPlayer.play(data);
  }

  hide(): void {
    this.#videoPlayer.stop();
    this.#stopUptime();
    this.root.classList.remove("is-visible");
    clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => {
      if (!this.root.classList.contains("is-visible")) this.root.hidden = true;
    }, 150);
  }

  remove(): void {
    clearTimeout(this.#hideTimer);
    this.#videoPlayer.stop();
    this.#stopUptime();
    this.root.remove();
  }

  #setImage(url: string): void {
    if (url) {
      this.#image.src = url;
      this.#image.hidden = false;
    } else {
      this.#image.removeAttribute("src");
      this.#image.hidden = true;
    }
  }

  /** 서명·토큰이 들어갈 수 있는 쿼리는 콘솔에 노출하지 않습니다. */
  #safeSource(value: string): string {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.split("?")[0] || value;
    }
  }

  #startUptime(openedAt: number | null): void {
    this.#stopUptime();
    if (openedAt == null) return;
    const update = (): void => { this.#uptime.textContent = formatBroadcastUptime(openedAt); };
    update();
    this.#uptimeTimer = setInterval(update, 1000);
  }

  #stopUptime(): void {
    clearInterval(this.#uptimeTimer);
    this.#uptimeTimer = undefined;
  }

  #position(target: HTMLElement): void {
    this.root.hidden = false;
    const targetRect = target.getBoundingClientRect();
    const width = Math.min(380, Math.max(260, window.innerWidth - 24));
    this.root.style.width = `${width}px`;
    const height = this.root.getBoundingClientRect().height || width * 9 / 16 + 76;
    let left = targetRect.right + 12;
    if (left + width > window.innerWidth - 12) left = targetRect.left - width - 12;
    if (left < 12) left = Math.max(12, (window.innerWidth - width) / 2);
    let top = targetRect.top + targetRect.height / 2 - height / 2;
    top = Math.max(12, Math.min(window.innerHeight - height - 12, top));
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
    requestAnimationFrame(() => this.root.classList.add("is-visible"));
  }
}
