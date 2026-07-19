import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/shared/settings";

describe("normalizeSettings", () => {
  it("uses defaults for missing and invalid values", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ enabled: "yes", preferredQuality: 1440 })).toEqual(DEFAULT_SETTINGS);
  });

  it("preserves supported values and clamps sharpness", () => {
    expect(normalizeSettings({ enabled: false, preferredQuality: 720, sharpnessIntensity: 9 })).toMatchObject({
      enabled: false,
      preferredQuality: 720,
      sharpnessIntensity: 3
    });
  });

  it("drops unknown keys", () => {
    expect(normalizeSettings({ unknown: true })).not.toHaveProperty("unknown");
  });
});
