import { describe, expect, it, vi } from "vitest";
import { FeatureRegistry, type FeatureModule } from "../src/core/feature";
import { DEFAULT_SETTINGS } from "../src/core/settings";

function feature(id = "test"): FeatureModule {
  return {
    id,
    start: vi.fn(),
    update: vi.fn(),
    scan: vi.fn(),
    stop: vi.fn()
  };
}

describe("FeatureRegistry", () => {
  it("starts once per enabled period and restarts after being enabled again", async () => {
    const module = feature();
    const registry = new FeatureRegistry(vi.fn()).register(module);

    await registry.update({ ...DEFAULT_SETTINGS });
    await registry.update({ ...DEFAULT_SETTINGS, preferredQuality: 720 });
    await registry.update({ ...DEFAULT_SETTINGS, enabled: false });
    await registry.update({ ...DEFAULT_SETTINGS, enabled: true });

    expect(module.start).toHaveBeenCalledTimes(2);
    expect(module.update).toHaveBeenCalledTimes(4);
    expect(module.stop).toHaveBeenCalledTimes(1);
  });

  it("isolates a feature error", async () => {
    const report = vi.fn();
    const broken = feature("broken");
    const healthy = feature("healthy");
    vi.mocked(broken.update).mockImplementation(() => { throw new Error("failed"); });
    const registry = new FeatureRegistry(report).register(broken).register(healthy);

    await registry.update({ ...DEFAULT_SETTINGS });

    expect(report).toHaveBeenCalledOnce();
    expect(healthy.update).toHaveBeenCalledOnce();
  });
});
