import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "../shared/settings";
import { MESSAGE } from "../shared/messages";

/** 팝업에 보여 줄 현재 화질, 방송 지연 시간, 재생 상태와 오류 정보입니다. */
interface PlayerStatus {
  quality: string;
  latency: string;
  state: string;
  error: string | null;
  stats?: StreamStatistics;
}

/** 플레이어 내부에서 확인한 통계 원본입니다. 없는 값은 억지로 추정하지 않습니다. */
export interface StreamStatistics {
  resolution: string;
  bitrateKbps: number | null;
  bufferSeconds: number;
  latencySeconds: number | null;
  droppedFrames: number;
  totalFrames: number;
  playbackRate: number;
  volume: number;
  readyState: number;
  networkState: number;
  trackId: string | null;
  codec: string | null;
}

/** 재생바가 표시할 수 있는 라이브 되돌려 보기 구간과 현재 위치입니다. */
export interface PlaybackState {
  currentTime: number;
  start: number;
  end: number;
  seekable: boolean;
  atLive: boolean;
  paused: boolean;
}

interface ContentActions {
  updatePlaybackState?: (state: PlaybackState) => void;
}

interface PlayerSelectors {
  video: string;
  player: string;
  settingsMenu: string;
  rightControls: string;
  settingButton: string;
  contextPane: string;
  contextList: string;
}

interface ChzzkPlusRuntime {
  readonly SELECTORS: Readonly<PlayerSelectors>;
  readonly ext: typeof browser;
  settings: Settings;
  actions: ContentActions;
  playerStatus: PlayerStatus;
  onSettingsChanged?: (settings: Settings) => void;
  Debug: typeof Debug;
  Toast: typeof Toast;
  postSettingsToPage: () => void;
  patchSettings: (patch: Partial<Settings>) => Promise<void>;
  injectPageScripts: () => Promise<void>;
  findVideo: () => HTMLVideoElement | null;
  findPlayer: (video?: HTMLVideoElement | null) => Element | null;
  readPlayerStatus: () => PlayerStatus;
  formatTime: (seconds: number) => string;
}

class Debug {
  static lastError = "";
  static lastErrorAt = 0;

  /** 같은 오류를 5초 동안 한 번만 사용자 알림으로 보여 줍니다. */
  static error(scope: string, message: string, detail?: unknown): void {
    void scope;
    void detail;
    CP.playerStatus.error = message;
    const now = Date.now();
    if (Debug.lastError === message && now - Debug.lastErrorAt < 5000) return;
    Debug.lastError = message;
    Debug.lastErrorAt = now;
    CP.Toast.show(`확장 프로그램 오류: ${message}`, "error");
  }

}

class Toast {
  static timer: ReturnType<typeof setTimeout> | undefined;

  /** 플레이어 위에 잠깐 나타났다 사라지는 작은 상태 알림을 표시합니다. */
  static show(message: string, tone = "normal"): void {
    let root = document.querySelector<HTMLElement>("#chzzk-plus-toast");
    if (!root) {
      root = document.createElement("div");
      root.id = "chzzk-plus-toast";
      document.documentElement.appendChild(root);
    }
    root.dataset.tone = tone;
    root.textContent = message;
    root.classList.add("show");
    if (Toast.timer) clearTimeout(Toast.timer);
    Toast.timer = setTimeout(() => root.classList.remove("show"), 1800);
  }
}

/**
 * 플레이어 화면을 꾸미는 기능들이 함께 사용하는 도구 모음입니다.
 *
 * 치지직 페이지 안에서 실행되는 각 기능의 사이트 내부 제어 코드와는 보안상 변수나 함수를 직접
 * 공유할 수 없습니다. 설정이나 재생 상태는 브라우저의 `window.postMessage`를
 * 이용해 편지처럼 주고받습니다.
 */
export const CP: ChzzkPlusRuntime = {
  SELECTORS: Object.freeze({
    video: "video.webplayer-internal-video, video",
    player: ".pzp, .pzp-pc, div.chzzk_player, [class*=\"live_player\"]",
    settingsMenu: ".pzp-pc__settings",
    rightControls: ".pzp-pc__bottom-buttons-right, .pzp-pc-bottom-buttons-right, div:has(> .pzp-pc-setting-button, > .pzp-ui-setting-button, > button[aria-label=\"설정\"], > button[aria-label=\"화질\"])",
    settingButton: ".pzp-pc-setting-button, .pzp-ui-setting-button, button[aria-label=\"설정\"]",
    contextPane: ".pzp-contextmenu-pane.pzp-pc-contextmenu-pane.pzp-pc__contextmenu-pane",
    contextList: ".pzp-contextmenu-pane__list"
  }),
  ext: browser,
  settings: { ...DEFAULT_SETTINGS },
  actions: {},
  playerStatus: { quality: "—", latency: "—", state: "플레이어 대기", error: null },
  Debug,
  Toast,
  // 저장된 설정을 치지직 페이지 안쪽 기능에도 전달합니다.
  postSettingsToPage: () => {
    window.postMessage({ source: "chzzk-plus-content", type: MESSAGE.websiteSettings, settings: CP.settings }, "*");
  },
  // 선명도 메뉴처럼 플레이어 안에서 설정을 바꿀 때 저장소와 현재 화면을 함께 갱신합니다.
  patchSettings: async (patch) => {
    const next = normalizeSettings({ ...CP.settings, ...patch });
    CP.settings = next;
    CP.onSettingsChanged?.(next);
    await CP.ext.storage.local.set({ settings: next });
  },
  // background에 page.js 실행을 요청합니다. 이미 실행됐다면 page.js가 스스로 중복을 막습니다.
  injectPageScripts: async () => {
    try {
      const response = await CP.ext.runtime.sendMessage({ type: MESSAGE.injectWebsite }) as { ok?: boolean; error?: string };
      if (!response?.ok) throw new Error(response?.error || "페이지 스크립트 실행 결과가 없습니다.");
    } catch (error) {
      CP.Debug.error("Runtime", "페이지 기능을 시작할 수 없습니다.", error);
      throw error;
    }
  },
  // 치지직의 클래스명이 조금 바뀌어도 영상을 찾을 수 있도록 좁은 선택자부터 확인합니다.
  findVideo: () => document.querySelector<HTMLVideoElement>(".pzp-pc video.webplayer-internal-video")
    || document.querySelector<HTMLVideoElement>("video.webplayer-internal-video")
    || document.querySelector<HTMLVideoElement>(".pzp-pc video")
    || document.querySelector<HTMLVideoElement>("video"),
  findPlayer: (video) => video?.closest(CP.SELECTORS.player) || video?.parentElement || null,
  // 팝업이 요청할 때 현재 video 요소만으로 확인 가능한 기본 상태를 만듭니다.
  readPlayerStatus: () => {
    const video = CP.findVideo();
    if (!video) return { ...CP.playerStatus, quality: "—", latency: "—", state: "플레이어 없음" };
    const edge = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : null;
    const state = video.error ? `오류 ${video.error.code}`
      : video.readyState < 2 ? "로딩"
      : video.seeking ? "탐색 중"
      : video.paused ? "일시정지" : "재생 중";
    return {
      ...CP.playerStatus,
      quality: CP.playerStatus.quality !== "—" ? CP.playerStatus.quality : (video.videoHeight ? `${video.videoHeight}p` : "측정 중"),
      latency: edge == null ? "—" : `${Math.max(0, edge - video.currentTime).toFixed(1)}초`,
      state
    };
  },
  // 초 단위 숫자를 00:00 또는 00:00:00 형태로 바꿉니다.
  formatTime: (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const value = Math.floor(seconds);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
};
