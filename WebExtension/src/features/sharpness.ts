import { CP } from "../content/runtime";

const MIN_INTENSITY = 1;
const MAX_INTENSITY = 3;
const DEFAULT_INTENSITY = 1.8;

interface SharpnessControls {
  item: HTMLElement;
  toggleWrapper: HTMLElement;
  toggle: HTMLInputElement;
  range: HTMLInputElement;
  value: HTMLOutputElement;
}

/**
 * 영상 선명도와 플레이어 설정 메뉴를 함께 관리합니다.
 * 원본 영상 데이터를 다시 처리하지 않고 Safari가 화면을 그릴 때 대비·채도·밝기를
 * 조금 조정하는 방식이라 가볍습니다. 값이 바뀐 경우에만 필터 문장을 다시 만듭니다.
 */
export class Sharpness {
    readonly id = "sharpness";
    private controls: SharpnessControls | null = null;
    private appliedKey = "";
    private previewFrame = 0;
    private readonly style: HTMLStyleElement;

    constructor() {
      this.style = document.createElement("style");
      this.style.id = "chzzk-plus-sharpness-style";
      document.querySelector("#chzzk-plus-sharpness-svg, #sharpnessSVGContainer")?.remove();
    }

    /** 기능을 켤 때 영상에 적용할 스타일 공간을 문서에 연결합니다. */
    start(): void {
      if (!this.style.isConnected) document.documentElement.appendChild(this.style);
    }

    /** 잘못된 값이 들어와도 선명도 강도를 1.0~3.0 사이로 맞춥니다. */
    private normalizeIntensity(value: unknown): number {
      return Math.max(MIN_INTENSITY, Math.min(MAX_INTENSITY, Number(value) || DEFAULT_INTENSITY));
    }

    /** 현재 강도를 대비·채도·밝기 값으로 계산하고 영상에 적용합니다. */
    private applyFilter(): void {
      const enabled = Boolean(CP.settings.enabled && CP.settings.sharpnessEnabled);
      const intensity = this.normalizeIntensity(CP.settings.sharpnessIntensity);
      const key = enabled ? intensity.toFixed(1) : "off";
      if (key === this.appliedKey) return;
      this.appliedKey = key;

      if (!enabled) {
        this.style.textContent = "";
        return;
      }

      const amount = intensity - 1;
      const contrast = 1 + amount * 0.11;
      const saturation = 1 + amount * 0.055;
      const brightness = 1 + amount * 0.008;
      const filter = `contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
      this.style.textContent = `${CP.SELECTORS.video} { filter: ${filter} !important; -webkit-filter: ${filter} !important; }`;
    }

    /** 저장된 설정과 플레이어 메뉴의 토글·게이지 표시를 일치시킵니다. */
    private refresh(): void {
      if (!this.controls?.item.isConnected) {
        this.controls = null;
        return;
      }
      const { item, toggleWrapper, toggle, range, value } = this.controls;
      const enabled = Boolean(CP.settings.sharpnessEnabled);
      const intensity = this.normalizeIntensity(CP.settings.sharpnessIntensity);
      toggle.checked = enabled;
      toggleWrapper.setAttribute("aria-checked", String(enabled));
      range.disabled = !enabled;
      range.value = String(intensity);
      range.style.setProperty("--sharpness-progress", `${((intensity - MIN_INTENSITY) / (MAX_INTENSITY - MIN_INTENSITY)) * 100}%`);
      value.textContent = intensity.toFixed(1);
      item.classList.toggle("is-disabled", !enabled);
    }

    /** 게이지를 움직이는 동안 화면 한 장마다 최대 한 번만 미리보기를 갱신합니다. */
    private preview(value: number): void {
      CP.settings.sharpnessIntensity = this.normalizeIntensity(value);
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = requestAnimationFrame(() => {
        this.previewFrame = 0;
        this.applyFilter();
      });
    }

    update(): void {
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = 0;
      this.applyFilter();
      if (!CP.settings.enabled) {
        this.controls?.item?.remove();
        this.controls = null;
        return;
      }
      this.refresh();
    }

    /** 치지직 설정 메뉴가 열리면 기본 메뉴 모양을 참고해 선명도 항목을 추가합니다. */
    scan(): void {
      if (!CP.settings.enabled) return;
      const menu = document.querySelector<HTMLElement>(CP.SELECTORS.settingsMenu);
      if (!menu || menu.querySelector("[data-chzzk-plus-sharpness]")) return;

      const nativeItem = menu.querySelector(".pzp-pc-setting-intro-filter");
      const item = document.createElement("div");
      item.className = `${nativeItem?.className || "pzp-ui-setting-home-item"} cqc-sharp-menu`;
      item.dataset.chzzkPlusSharpness = "";
      item.setAttribute("role", "group");
      item.setAttribute("aria-label", "화면 선명도");
      item.innerHTML = `
        <div class="pzp-ui-setting-home-item__top cqc-sharp-main">
          <div class="pzp-ui-setting-home-item__left">
            <span class="pzp-ui-setting-home-item__label">화면 선명도</span>
          </div>
          <div class="pzp-ui-setting-home-item__right"></div>
        </div>
        <div class="cqc-sharp-gauge">
          <input type="range" min="${MIN_INTENSITY}" max="${MAX_INTENSITY}" step="0.1" aria-label="선명도 강도">
          <output>1.8</output>
        </div>`;

      // 치지직의 바로 위 설정이 사용하는 스위치와 같은 HTML 구조·CSS 클래스를 씁니다.
      // 별도 모양을 그리지 않으므로 치지직이 토글 디자인을 바꿔도 함께 바뀝니다.
      const toggleWrapper = document.createElement("div");
      toggleWrapper.className = "pzp-ui-toggle cqc-sharp-toggle";
      toggleWrapper.setAttribute("role", "switch");
      toggleWrapper.setAttribute("aria-label", "화면 선명도 켜기");
      toggleWrapper.tabIndex = 0;
      toggleWrapper.innerHTML = `
        <input type="checkbox" class="pzp-ui-toggle__checkbox" tabindex="-1">
        <div class="pzp-ui-toggle__handle"></div>`;
      item.querySelector(".pzp-ui-setting-home-item__right")?.appendChild(toggleWrapper);

      ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "contextmenu"].forEach((type) => {
        item.addEventListener(type, (event) => event.stopPropagation());
      });

      const toggle = toggleWrapper.querySelector<HTMLInputElement>('.pzp-ui-toggle__checkbox');
      const range = item.querySelector<HTMLInputElement>('.cqc-sharp-gauge input');
      const value = item.querySelector<HTMLOutputElement>('.cqc-sharp-gauge output');
      if (!toggle || !range || !value) return;
      const changeToggle = (): void => {
        const enabled = !toggle.checked;
        toggle.checked = enabled;
        toggleWrapper.setAttribute("aria-checked", String(enabled));
        void CP.patchSettings({ sharpnessEnabled: enabled });
      };
      toggleWrapper.addEventListener("click", changeToggle);
      toggleWrapper.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        changeToggle();
      });
      range.addEventListener("input", () => {
        const intensity = this.normalizeIntensity(range.value);
        value.textContent = intensity.toFixed(1);
        range.style.setProperty("--sharpness-progress", `${((intensity - MIN_INTENSITY) / (MAX_INTENSITY - MIN_INTENSITY)) * 100}%`);
        this.preview(intensity);
      });
      range.addEventListener("change", () => {
        void CP.patchSettings({ sharpnessIntensity: this.normalizeIntensity(range.value) });
      });

      if (nativeItem) nativeItem.insertAdjacentElement("afterend", item);
      else menu.appendChild(item);
      this.controls = { item, toggleWrapper, toggle, range, value };
      this.refresh();
    }
    /** 기능을 끌 때 메뉴, 대기 중인 미리보기와 영상 필터를 모두 제거합니다. */
    stop(): void {
      cancelAnimationFrame(this.previewFrame);
      this.controls?.item.remove();
      this.controls = null;
      this.style.remove();
    }
  }
