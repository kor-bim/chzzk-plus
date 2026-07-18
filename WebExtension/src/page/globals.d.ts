/**
 * 치지직 플레이어 요소에 붙는 내부 제어 객체와, 같은 코드가 두 번 실행되는 것을
 * 막는 표시를 TypeScript가 이해하도록 알려 주는 파일입니다. 실제 동작 코드는 없습니다.
 */
interface Element {
  __vue__?: any;
}

interface Window {
  __chzzkPlusBlindedInstalled?: boolean;
  __chzzkPlusNetworkInstalled?: boolean;
  __chzzkPlusPlayerInstalled?: boolean;
}
