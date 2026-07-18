/**
 * 팝업에서 저장할 수 있는 전체 설정 목록입니다.
 * 이 목록, 기본값, 팝업 입력 항목은 항상 함께 관리해야 합니다.
 */
export interface Settings {
  enabled: boolean;
  sharpnessEnabled: boolean;
  sharpnessIntensity: number;
  preferredQuality: number;
  playbackBarEnabled: boolean;
  streamStatsEnabled: boolean;
  statsContextMenuEnabled: boolean;
  autoAdSkip: boolean;
  networkAdBlock: boolean;
  adPopupRemoval: boolean;
  screenshotEnabled: boolean;
  rankingHideEnabled: boolean;
  blindedRestoreEnabled: boolean;
  blindedAutoRestoreEnabled: boolean;
}

/** 처음 설치하거나 이전 버전 설정에 값이 빠졌을 때 채워 넣는 기본 설정입니다. */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  enabled: true,
  sharpnessEnabled: false,
  sharpnessIntensity: 1.8,
  preferredQuality: 1080,
  playbackBarEnabled: true,
  streamStatsEnabled: true,
  statsContextMenuEnabled: true,
  autoAdSkip: true,
  networkAdBlock: true,
  adPopupRemoval: true,
  screenshotEnabled: true,
  rankingHideEnabled: true,
  blindedRestoreEnabled: true,
  blindedAutoRestoreEnabled: false
});

export const COMPOSITE_SETTINGS = Object.freeze({
  streamStats: ["streamStatsEnabled", "statsContextMenuEnabled"],
  adBlock: ["networkAdBlock", "autoAdSkip", "adPopupRemoval"],
  blindedChat: ["blindedRestoreEnabled", "blindedAutoRestoreEnabled"]
} as const satisfies Record<string, readonly (keyof Settings)[]>);

// 팝업에서 선택할 수 있는 화질만 저장되도록 허용 목록을 둡니다.
const QUALITY_OPTIONS = new Set([1080, 720, 480, 360]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSettings(value: unknown): Settings {
  // Safari 저장소의 값은 사용자가 예전 버전에서 저장한 값일 수도 있으므로 그대로
  // 믿지 않습니다. 켜기/끄기는 참·거짓만 받고 숫자는 가능한 범위 안으로 맞춥니다.
  const source = isRecord(value) ? value : {};
  const result = { ...DEFAULT_SETTINGS } as Settings;

  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS) as [keyof Settings, Settings[keyof Settings]][]) {
    const candidate = source[key];
    if (typeof fallback === "boolean" && typeof candidate === "boolean") {
      (result as Record<keyof Settings, unknown>)[key] = candidate;
    }
  }

  const intensity = Number(source.sharpnessIntensity);
  result.sharpnessIntensity = Number.isFinite(intensity)
    ? Math.max(1, Math.min(3, intensity))
    : DEFAULT_SETTINGS.sharpnessIntensity;

  const quality = Number(source.preferredQuality);
  result.preferredQuality = QUALITY_OPTIONS.has(quality) ? quality : DEFAULT_SETTINGS.preferredQuality;
  return result;
}
