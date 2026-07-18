# CHZZK Plus WebExtension

Safari 확장 프로그램에서 실행되는 웹 코드와 빌드 도구입니다. 원본은 모두
TypeScript로 관리하며 esbuild가 Safari에서 실행할 JavaScript 번들을 `dist/`에
생성합니다. TypeScript 원본, 테스트, 빌드 도구는 완성된 앱에 포함되지 않습니다.

## 실행 구조

Safari WebExtension은 권한이 다른 세 실행 환경을 사용합니다.

```text
background.js (Safari 확장 백그라운드)
  └─ 사이트 내부용 page.js를 치지직 탭에 연결

content.js (Safari가 사이트와 분리해 둔 안전한 실행 공간)
  ├─ 설정과 기능 수명주기 관리
  ├─ 플레이어 UI 및 채팅 화면 조작
  └─ window.postMessage로 page.js와 통신

page.js (치지직 사이트 코드와 같은 실행 공간)
  ├─ fetch/XHR 광고 응답 처리
  ├─ CHZZK 플레이어 및 화질 제어
  └─ 블라인드 채팅 원문 탐색

popup.js (툴바 팝업)
  ├─ 설정 저장
  └─ 활성 탭의 플레이어 상태 표시
```

`content.js`와 `page.js`를 나누는 이유는 Safari의 보안 격리 때문입니다. 콘텐츠
스크립트는 사이트의 화면 요소에는 접근할 수 있지만 사이트가 가진 JavaScript 객체나
사이트가 사용하는 `fetch`/`XMLHttpRequest`를 직접 바꿀 수 없습니다. 해당 작업만
`page.js`에서 수행하고 두 환경은 구조화된 메시지만 교환합니다.

## 디렉터리

```text
WebExtension/
├─ src/
│  ├─ background/   Safari 백그라운드 진입점과 권한 API
│  ├─ content/      기능 시작·종료, 공유 상태, 화면 변경 감시
│  ├─ core/         모든 환경에서 공유하는 설정·메시지·기능 계약
│  ├─ features/     콘텐츠 환경에서 동작하는 독립 기능
│  ├─ page/         치지직 사이트 내부 정보가 필요한 기능
│  └─ popup/        툴바 팝업 로직
├─ public/          manifest, HTML, CSS, 아이콘 등 그대로 복사할 파일
├─ scripts/         esbuild 및 Xcode 연결 스크립트
├─ tests/           브라우저 없이 실행 가능한 단위 테스트
└─ dist/            자동 생성되는 Safari 실행 파일; 직접 수정 금지
```

기능 파일 수가 작고 하나의 책임만 가지므로 현재 `features/`는 평면 구조를
사용합니다. 한 기능이 UI, 상태, 테스트 등 여러 파일로 커지면 그 기능만
`features/<기능명>/` 하위 폴더로 분리합니다. 실행 환경이 다른 코드를 한 폴더에
섞지 않는 것이 가장 중요한 규칙입니다.

## 빌드 흐름

Xcode의 `chzzk-plus Extension (macOS)` 타깃에는 `Bundle Web Extension` Build
Phase가 등록되어 있습니다. Xcode에서 빌드하면 다음 과정이 자동 실행됩니다.

```text
Xcode 빌드
  → WebExtension/scripts/xcode-build.sh
  → npm run build
  → esbuild가 dist 생성
  → dist 내용을 Safari Extension.appex/Contents/Resources로 복사
```

Debug 빌드는 압축하지 않고 인라인 소스맵을 넣습니다. Release 빌드는 코드를
압축하고 소스맵을 제외합니다. 어느 경우에도 `dist`는 원본이 아니므로 직접
편집하지 않습니다.

## 개발 명령

처음 저장소를 받은 후 한 번 실행합니다.

```sh
npm ci
```

평소에는 Xcode에서 `⌘R`만 눌러 최신 번들을 만들고 Safari에서 확인할 수 있습니다.
터미널에서 개별적으로 확인할 때는 다음 명령을 사용합니다.

```sh
npm run dev       # 변경 감시 및 Debug 번들 생성
npm run check     # TypeScript 타입 검사와 ESLint
npm test          # 단위 테스트
npm run verify    # 검사, 테스트, Release 번들을 모두 검증
npm run build     # Release 번들만 dist에 생성
```

## 기능 추가 방법

화면 요소를 조작하는 기능은 `src/features/<기능명>.ts`에 `FeatureModule` 규칙을 구현하고
`src/content/index.ts`의 `FeatureRegistry`에 등록합니다.

```ts
export class ExampleFeature {
  readonly id = "example";

  update(): void {
    // 설정 변경을 화면 상태에 반영합니다.
  }

  scan(): void {
    // 페이지 이동이나 방송 전환 뒤 필요한 UI를 다시 연결합니다.
  }

  stop(): void {
    // 추가한 화면 요소, 입력 동작, 변경 감시, 반복 작업을 모두 정리합니다.
  }
}
```

사이트의 네트워크 함수나 비공개 플레이어 객체가 필요한 기능은 `src/page/`에
둡니다. page 기능은 확장 API를 직접 사용할 수 없으므로 설정과 결과를
`window.postMessage`로 콘텐츠 환경에 전달해야 합니다.

설정 항목을 추가할 때는 다음 세 곳을 함께 수정합니다.

1. `src/core/settings.ts`의 `Settings`, `DEFAULT_SETTINGS`, 정규화 규칙
2. `public/popup.html`의 입력 요소
3. 필요한 기능의 `update()` 또는 page 설정 메시지 처리

마지막으로 `npm run verify`가 통과해야 기능 추가가 완료된 것으로 봅니다.
