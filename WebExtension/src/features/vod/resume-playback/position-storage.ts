const STORAGE_KEY = "vodResumePositions";
const MAX_RECORDS = 100;
const MAX_AGE = 90 * 24 * 60 * 60 * 1000;

interface SavedVodPosition {
  position: number;
  updatedAt: number;
}

type PositionMap = Record<string, SavedVodPosition>;

/** Safari 저장소 접근을 한곳에 모으고 오래된 기록과 과도한 항목 수를 정리합니다. */
export class VodPositionStorage {
  #cache: PositionMap | null = null;

  async #load(): Promise<PositionMap> {
    if (this.#cache) return this.#cache;
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const source = stored[STORAGE_KEY];
    if (!source || typeof source !== "object") {
      this.#cache = {};
      return this.#cache;
    }
    this.#cache = Object.fromEntries(Object.entries(source as Record<string, unknown>).filter((entry): entry is [string, SavedVodPosition] => {
      const value = entry[1];
      if (!value || typeof value !== "object") return false;
      const record = value as Partial<SavedVodPosition>;
      return Number.isFinite(record.position) && Number.isFinite(record.updatedAt);
    }));
    return this.#cache;
  }

  async get(videoId: string): Promise<SavedVodPosition | null> {
    const positions = await this.#load();
    const record = positions[videoId];
    if (!record || Date.now() - record.updatedAt > MAX_AGE) return null;
    return record;
  }

  async save(videoId: string, position: number, duration: number): Promise<void> {
    const positions = await this.#load();
    if (position < 10 || (Number.isFinite(duration) && duration - position < 30)) {
      delete positions[videoId];
    } else {
      positions[videoId] = { position, updatedAt: Date.now() };
    }

    const recent = Object.entries(positions)
      .filter(([, value]) => Date.now() - value.updatedAt <= MAX_AGE)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_RECORDS);
    this.#cache = Object.fromEntries(recent);
    await browser.storage.local.set({ [STORAGE_KEY]: this.#cache });
  }
}
