/**
 * 치지직이 방송 화면을 새로 그렸는지 한곳에서 감시합니다.
 *
 * 치지직은 링크를 이동해도 페이지 전체를 새로고침하지 않고 필요한 부분만 다시
 * 그립니다. 따라서 처음 찾았던 플레이어 버튼이나 메뉴가 사라지고 새 요소로
 * 바뀔 수 있습니다. 이 관리자는 변화를 모아서 300ms 뒤 한 번만 알립니다. 변화가
 * 생길 때마다 모든 기능을 즉시 실행하는 것보다 CPU 사용과 중복 작업이 적습니다.
 */
export class DomObserver {
  readonly #listeners = new Set<(root: ParentNode) => void>();
  readonly #observer: MutationObserver;
  readonly #delay: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #active = false;

  constructor(delay = 300) {
    this.#delay = delay;
    this.#observer = new MutationObserver((records) => {
      // 우리가 만든 재생바·알림·통계가 바뀐 것은 치지직 화면 변경이 아닙니다.
      // 이런 변화까지 다시 검사하면 자기 자신 때문에 검사가 반복될 수 있습니다.
      const internalOnly = records.every((record) => record.target instanceof Element
        && record.target.closest("#chzzk-plus-playback-bar, #chzzk-plus-toast, .chzzk-plus-stats"));
      if (!internalOnly) this.schedule();
    });
  }

  /** 화면 변화가 생겼을 때 호출할 기능 관리자를 등록하고 해제 함수를 돌려줍니다. */
  subscribe(listener: (root: ParentNode) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** 짧은 시간에 변화가 여러 번 와도 예약은 하나만 유지합니다. */
  schedule(root: ParentNode = document): void {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      for (const listener of this.#listeners) listener(root);
    }, this.#delay);
  }

  /** 치지직 문서 전체의 자식 요소 변화를 감시하기 시작합니다. */
  start(): void {
    if (this.#active || !document.documentElement) return;
    this.#observer.observe(document.documentElement, { childList: true, subtree: true });
    this.#active = true;
    this.schedule();
  }

  /** 설정은 유지한 채 화면 감시와 대기 중인 검사를 잠시 멈춥니다. */
  pause(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#observer.disconnect();
    this.#active = false;
  }

  /** 탭 종료 시 감시와 등록된 알림 함수를 모두 제거합니다. */
  stop(): void {
    this.pause();
    this.#listeners.clear();
  }
}
