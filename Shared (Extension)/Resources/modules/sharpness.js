(() => {
  "use strict";
  const CP = globalThis.ChzzkPlus;
  const MIN_INTENSITY = 1;
  const MAX_INTENSITY = 3;
  const DEFAULT_INTENSITY = 1.8;

  CP.modules.Sharpness = class Sharpness {
    constructor() {
      this.controls = null;
      this.appliedKey = "";
      this.previewFrame = 0;
      this.style = document.createElement("style");
      this.style.id = "chzzk-plus-sharpness-style";
      document.documentElement.appendChild(this.style);
      document.querySelector("#chzzk-plus-sharpness-svg, #sharpnessSVGContainer")?.remove();
    }

    normalizeIntensity(value) {
      return Math.max(MIN_INTENSITY, Math.min(MAX_INTENSITY, Number(value) || DEFAULT_INTENSITY));
    }

    applyFilter() {
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

    refresh() {
      const { item, toggle, range, value } = this.controls || {};
      if (!item?.isConnected) {
        this.controls = null;
        return;
      }
      const enabled = Boolean(CP.settings.sharpnessEnabled);
      const intensity = this.normalizeIntensity(CP.settings.sharpnessIntensity);
      toggle.checked = enabled;
      range.disabled = !enabled;
      range.value = String(intensity);
      range.style.setProperty("--sharpness-progress", `${((intensity - MIN_INTENSITY) / (MAX_INTENSITY - MIN_INTENSITY)) * 100}%`);
      value.textContent = intensity.toFixed(1);
      item.classList.toggle("is-disabled", !enabled);
    }

    preview(value) {
      CP.settings.sharpnessIntensity = this.normalizeIntensity(value);
      cancelAnimationFrame(this.previewFrame);
      this.previewFrame = requestAnimationFrame(() => {
        this.previewFrame = 0;
        this.applyFilter();
      });
    }

    update() {
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

    scan() {
      if (!CP.settings.enabled) return;
      const menu = document.querySelector(CP.SELECTORS.settingsMenu);
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
          <div class="pzp-ui-setting-home-item__right">
            <label class="cqc-sharp-toggle" aria-label="화면 선명도 켜기">
              <input type="checkbox">
              <span aria-hidden="true"></span>
            </label>
          </div>
        </div>
        <div class="cqc-sharp-gauge">
          <input type="range" min="${MIN_INTENSITY}" max="${MAX_INTENSITY}" step="0.1" aria-label="선명도 강도">
          <output>1.8</output>
        </div>`;

      ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "contextmenu"].forEach((type) => {
        item.addEventListener(type, (event) => event.stopPropagation());
      });

      const toggle = item.querySelector('.cqc-sharp-toggle input');
      const range = item.querySelector('.cqc-sharp-gauge input');
      const value = item.querySelector('.cqc-sharp-gauge output');
      toggle.addEventListener("change", () => {
        CP.patchSettings({ sharpnessEnabled: toggle.checked });
      });
      range.addEventListener("input", () => {
        const intensity = this.normalizeIntensity(range.value);
        value.textContent = intensity.toFixed(1);
        range.style.setProperty("--sharpness-progress", `${((intensity - MIN_INTENSITY) / (MAX_INTENSITY - MIN_INTENSITY)) * 100}%`);
        this.preview(intensity);
      });
      range.addEventListener("change", () => {
        CP.patchSettings({ sharpnessIntensity: this.normalizeIntensity(range.value) });
      });

      if (nativeItem) nativeItem.insertAdjacentElement("afterend", item);
      else menu.appendChild(item);
      this.controls = { item, toggle, range, value };
      this.refresh();
    }
  };
})();
