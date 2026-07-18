import type { Settings } from "./settings";

/**
 * 플레이어 기능 하나가 따라야 하는 공통 순서입니다.
 *
 * - start: 확장 기능을 켤 때 이벤트와 준비물을 연결합니다.
 * - update: 바뀐 설정을 현재 화면에 반영합니다.
 * - scan: 치지직 화면이 다시 그려졌을 때 필요한 버튼과 메뉴를 찾습니다.
 * - stop: 기능을 끌 때 추가한 화면 요소, 이벤트, 타이머를 정리합니다.
 */
export interface FeatureModule {
  readonly id: string;
  start?(): void | Promise<void>;
  update(settings: Readonly<Settings>): void | Promise<void>;
  scan?(root?: ParentNode): void;
  stop?(): void | Promise<void>;
}

type ErrorReporter = (scope: string, message: string, error?: unknown) => void;

/** 모든 화면 기능을 등록된 순서대로 안전하게 실행하는 관리자입니다. */
export class FeatureRegistry {
  readonly #features = new Map<string, FeatureModule>();
  readonly #reportError: ErrorReporter;
  #active = false;

  constructor(reportError: ErrorReporter) {
    this.#reportError = reportError;
  }

  /** 같은 이름의 기능이 두 번 실행되지 않도록 확인한 뒤 목록에 추가합니다. */
  register(feature: FeatureModule): this {
    if (this.#features.has(feature.id)) throw new Error(`중복 기능 ID: ${feature.id}`);
    this.#features.set(feature.id, feature);
    return this;
  }

  /** 전체 켜짐 상태와 개별 설정을 모든 기능에 전달합니다. */
  async update(settings: Readonly<Settings>): Promise<void> {
    // 기능 하나가 실패해도 다른 기능의 설정 적용이 계속되도록 기능별로 오류를 격리합니다.
    const shouldStart = settings.enabled && !this.#active;
    this.#active = settings.enabled;
    for (const feature of this.#features.values()) {
      try {
        if (shouldStart) await feature.start?.();
        await feature.update(settings);
        if (!this.#active) await feature.stop?.();
      } catch (error) {
        this.#reportError(feature.id, "설정 적용 실패", error);
      }
    }
  }

  /** 새로 생긴 치지직 화면 요소를 각 기능이 다시 확인하게 합니다. */
  scan(root: ParentNode = document): void {
    if (!this.#active) return;
    for (const feature of this.#features.values()) {
      try {
        feature.scan?.(root);
      } catch (error) {
        this.#reportError(feature.id, "DOM 연결 실패", error);
      }
    }
  }

  /** 탭을 닫거나 확장 기능을 끌 때 등록된 기능을 모두 정리합니다. */
  async stop(): Promise<void> {
    this.#active = false;
    for (const feature of this.#features.values()) {
      try {
        await feature.stop?.();
      } catch (error) {
        this.#reportError(feature.id, "기능 종료 실패", error);
      }
    }
  }
}
