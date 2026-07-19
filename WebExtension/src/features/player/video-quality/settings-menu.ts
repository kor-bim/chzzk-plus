export interface QualitySettings {
  enabled: boolean;
  preferredQuality: number;
}

/** 팝업에서 전달된 값 중 화질 기능이 사용하는 설정만 안전하게 합칩니다. */
export function mergeQualitySettings(current: QualitySettings, value: unknown): QualitySettings {
  const source = value && typeof value === "object" ? value as Partial<QualitySettings> : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : current.enabled,
    preferredQuality: Number.isFinite(source.preferredQuality) ? Number(source.preferredQuality) : current.preferredQuality
  };
}
