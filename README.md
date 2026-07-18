<div align="center">
  <img src="WebExtension/public/images/icon-128.png" width="112" height="112" alt="CHZZK Plus 아이콘">

  <h1>CHZZK Plus</h1>

  <p>
    <strong>Safari에서 치지직 라이브 시청 경험을 더 선명하고 편리하게.</strong>
  </p>

  <p>
    플레이어 · 화질 · 스트림 통계 · 광고 · 채팅을 개선하는<br>
    가볍고 빠른 macOS용 Safari WebExtension
  </p>

  <p>
    <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS">
    <img src="https://img.shields.io/badge/Safari_18+-000000?style=for-the-badge&logo=safari&logoColor=00FFA3" alt="Safari 18 이상">
    <img src="https://img.shields.io/badge/TypeScript-000000?style=for-the-badge&logo=typescript&logoColor=00FFA3" alt="TypeScript">
    <img src="https://img.shields.io/badge/Manifest_V3-000000?style=for-the-badge&logo=safari&logoColor=00FFA3" alt="Manifest V3">
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-0.1.0-00FFA3?style=flat-square&labelColor=000000" alt="Version 0.1.0">
    <img src="https://img.shields.io/badge/license-MIT-00FFA3?style=flat-square&labelColor=000000" alt="MIT License">
  </p>
</div>

---

## 소개

**CHZZK Plus**는 macOS Safari에서 [치지직](https://chzzk.naver.com/) 라이브를
시청할 때 필요한 기능을 플레이어와 채팅에 자연스럽게 추가하는 Safari 확장
프로그램입니다.

치지직의 기본 UI 배치와 사용 방식을 최대한 유지하면서 자동 화질 고정, 화면
선명도 조절, 라이브 재생바, 스트림 통계, 광고 처리, 채팅 정리 기능을 제공합니다.
브랜드 색상은 치지직의 Neon Green `#00FFA3`과 Black `#000000`을 사용합니다.

확장 기능은 TypeScript로 작성하고 esbuild로 네 개의 JavaScript 번들만 생성합니다.
DOM 감시는 하나로 합치고, 반복 작업은 화면 상태에 맞춰 조절하며, 기능 하나의
오류가 다른 기능을 중단시키지 않도록 수명주기를 분리했습니다.

## 지원 환경

| 항목 | 지원 |
|---|---|
| 운영체제 | macOS |
| 브라우저 | Safari 18 이상 |
| 대상 사이트 | `https://chzzk.naver.com/*` |
| 확장 규격 | Safari WebExtension · Manifest V3 |
| 프로세서 | Apple Silicon · Intel Mac |
| iPhone · iPad | 지원하지 않음 |
| Chrome · Edge · Firefox | 공식 지원하지 않음 |

## 기능

### 플레이어와 화질

- **선호 화질 자동 고정**
  - `1080p`, `720p`, `480p`, `360p` 중 선호 화질 선택
  - 선택한 해상도가 없으면 그보다 낮은 최적 해상도 또는 최고 해상도 선택
  - 지연이 짧은 재생 방식을 가능한 한 유지
  - 새로고침 없는 페이지 이동이나 방송 전환으로 플레이어가 다시 만들어지면 자동 재적용
  - 화질이 선호값보다 낮아졌을 때만 제한적으로 복구해 불필요한 화질 변경 방지

- **화면 선명도**
  - 플레이어 설정 메뉴에서 바로 켜고 끄는 토글
  - `1.0`부터 `3.0`까지 `0.1` 단위 강도 조절
  - 대비, 채도, 밝기를 함께 보정하는 가벼운 CSS 필터 방식
  - 슬라이더 입력 중에는 `requestAnimationFrame` 단위로 미리보기 적용

- **라이브 재생바**
  - 치지직 기본 진행 막대를 대체하는 플레이어 통합형 UI
  - Safari가 제공하는 `seekable` 또는 `buffered` 라이브 구간 사용
  - 클릭, 드래그, 방향키, Home, End 키 탐색 지원
  - 현재 위치, 되돌려 볼 수 있는 전체 구간, 실시간 복귀 상태 표시
  - 탐색할 수 없는 스트림은 LIVE 상태로 안전하게 표시

- **플레이어 상태 표시**
  - 확장 프로그램 팝업에서 현재 화질 확인
  - LIVE 엣지 기준 레이턴시 확인
  - 재생, 일시정지, 로딩, 탐색, 오류 상태 확인
  - 치지직 탭과 연결되지 않은 상태 구분

### 스트림 도구

- **스트림 통계 오버레이**
  - 영상 해상도
  - 추정 비트레이트
  - 버퍼 길이
  - LIVE 지연
  - 드롭 프레임과 전체 프레임
  - 재생 속도와 볼륨
  - 미디어 Ready State와 Network State
  - 플레이어 우클릭 메뉴에서 실행
  - `⌘/Ctrl + Shift + D` 단축키 지원

- **영상 스크린샷**
  - Safari 탭 캡처 API로 현재 보이는 영상 영역 저장
  - 브라우저 배율과 실제 캡처 해상도를 계산해 영상 부분만 자르기
  - 플레이어 버튼 또는 `⌘/Ctrl + Shift + S` 단축키 지원
  - PNG 파일명에 촬영 시각 자동 포함

### 광고 처리

- **네트워크 단계 처리**
  - 치지직 광고 폴링 요청을 빈 정상 응답으로 대체
  - Veta 광고 호출 차단
  - 영상 응답의 광고 일정과 광고 구간 제거
  - 방송 시작 전·방송 중간 광고 표시 상태 비활성화
  - 사용자 광고 노출 상태 응답 보정
  - `fetch`, `XMLHttpRequest`, JSON 응답 경로 지원

- **플레이어 단계 처리**
  - 화면에 나타난 광고 건너뛰기 버튼 자동 실행
  - 광고 차단 감지 팝업 자동 닫기 및 숨김
  - 팝업이 잠근 페이지 스크롤 상태 복구
  - 광고 요청을 처리했을 때 중복을 제한한 토스트 표시

### 채팅

- **순위권 채팅 숨김**
  - 라이브 채팅에서 순위권 강조 영역을 CSS로 정리

- **블라인드 채팅 보이기**
  - 치지직 React 데이터에 남아 있는 원문 탐색
  - 확인한 원문을 제한된 메모리 캐시에 보관
  - 블라인드 메시지에 마우스를 올렸을 때 원문 표시
  - 설정에 따라 원문을 항상 표시
  - 확장 프로그램을 끄면 원래 블라인드 문구로 복원

### 설정과 안정성

- 전체 확장 기능을 한 번에 끄는 마스터 토글
- 설정 변경 즉시 현재 치지직 탭에 반영
- 기능별 화면 요소, 입력 동작, 화면 변경 감시, 반복 작업을 분리
- 기능 하나에서 오류가 발생해도 나머지 기능은 계속 실행
- 새로고침 없는 페이지 이동과 방송 전환을 하나의 화면 변경 감시기로 처리
- 확장 프로그램이 직접 만든 화면 변경은 재검사 대상에서 제외
- 백그라운드 탭에서는 플레이어 검사 주기를 낮춰 불필요한 작업 감소

## 구조

### 전체 흐름

```text
Safari
├─ background.js ── 사이트 내부용 page.js를 치지직 탭에 연결
├─ content.js ───── 설정·화면 요소·플레이어 UI·기능 시작/종료
├─ page.js ──────── 네트워크·비공개 플레이어·채팅 원문 데이터
└─ popup.js ─────── 설정과 현재 플레이어 상태

content.js ⇄ window.postMessage ⇄ page.js
```

Safari의 콘텐츠 스크립트는 사이트 DOM에는 접근할 수 있지만 사이트가 가진
JavaScript 객체와 네트워크 함수를 직접 수정할 수 없습니다. 그래서 UI는
`content.js`, 사이트 내부 객체가 필요한 작업은 `page.js`로 나누고 메시지로만
통신합니다.

### 저장소 최상위

| 경로 | 역할 |
|---|---|
| `README.md` | 프로젝트 소개와 전체 구조 문서 |
| `LICENSE` | MIT 라이선스 원문 |
| `.gitignore` | 빌드 산출물, 의존성, 사용자별 Xcode 파일 제외 규칙 |
| `chzzk-plus.xcodeproj/` | macOS 앱과 Safari Extension 타깃을 묶는 Xcode 프로젝트 |
| `chzzk-plus.xcodeproj/project.pbxproj` | 타깃, 빌드 설정, 리소스, `Bundle Web Extension` Build Phase 정의 |
| `chzzk-plus.xcodeproj/xcshareddata/xcschemes/` | 공유 macOS 빌드·실행 Scheme |
| `Shared (App)/` | macOS 컨테이너 앱에서 공통으로 사용하는 화면과 에셋 |
| `macOS (App)/` | macOS 앱 진입점과 Storyboard |
| `Shared (Extension)/` | Safari WebExtension 네이티브 메시지 핸들러 |
| `macOS (Extension)/` | macOS Safari Extension의 `Info.plist` |
| `WebExtension/` | 실제 확장 기능의 TypeScript 원본, 정적 리소스, 빌드 도구, 테스트 |

### macOS 앱과 Safari Extension

| 파일 | 역할 |
|---|---|
| `Shared (App)/ViewController.swift` | 컨테이너 앱 WebView와 앱 화면 제어 |
| `Shared (App)/Resources/Base.lproj/Main.html` | 컨테이너 앱의 안내 화면 마크업 |
| `Shared (App)/Resources/Style.css` | 컨테이너 앱 안내 화면 디자인 |
| `Shared (App)/Resources/Script.js` | 컨테이너 앱 안내 화면 동작 |
| `Shared (App)/Resources/Icon.png` | 컨테이너 앱 화면에 사용하는 아이콘 |
| `Shared (App)/AppIcon.icon/` | 최신 Xcode Icon Composer 앱 아이콘 원본 |
| `Shared (App)/Assets.xcassets/` | 앱 아이콘, 강조색 등 Xcode 에셋 카탈로그 |
| `macOS (App)/AppDelegate.swift` | macOS 앱 수명주기 진입점 |
| `macOS (App)/Base.lproj/Main.storyboard` | macOS 앱 창과 ViewController 연결 |
| `Shared (Extension)/SafariWebExtensionHandler.swift` | WebExtension과 네이티브 앱 사이의 메시지 진입점 |
| `macOS (Extension)/Info.plist` | Safari Extension 번들 정보와 principal class 설정 |

### WebExtension 설정과 빌드

| 파일 | 역할 |
|---|---|
| `WebExtension/package.json` | 검사, 테스트, esbuild, Safari 빌드 명령과 개발 의존성 |
| `WebExtension/package-lock.json` | 개발 도구 버전을 동일하게 재현하기 위한 잠금 파일 |
| `WebExtension/tsconfig.json` | Safari 18 화면 API와 엄격한 TypeScript 검사 설정 |
| `WebExtension/eslint.config.js` | TypeScript와 빌드 스크립트 정적 검사 규칙 |
| `WebExtension/README.md` | 개발 흐름, 실행 환경, 기능 추가 규칙을 설명하는 내부 문서 |
| `WebExtension/scripts/build.mjs` | 정적 파일 복사와 네 개의 esbuild 번들 생성 |
| `WebExtension/scripts/xcode-build.sh` | Xcode Debug/Release를 esbuild 모드로 연결하고 `dist`를 `.appex`에 복사 |
| `WebExtension/tests/feature-registry.test.ts` | 기능 시작·업데이트·종료·오류 격리 테스트 |
| `WebExtension/tests/settings.test.ts` | 저장 설정 기본값과 입력 정규화 테스트 |
| `WebExtension/dist/` | 자동 생성되는 실행 번들; Git에서 제외하며 직접 수정하지 않음 |

### TypeScript 소스

| 파일 | 역할 |
|---|---|
| `src/background/index.ts` | 설정 초기화, 탭 캡처, 사이트 내부용 `page.js` 연결 |
| `src/content/index.ts` | 콘텐츠 진입점, 기능 등록, 설정 수명주기, page 메시지 처리 |
| `src/content/runtime.ts` | 콘텐츠 기능이 공유하는 선택자, 상태, Toast, 설정 저장, 영상 탐색 API |
| `src/content/dom-observer.ts` | 페이지 이동·방송 전환에 따른 화면 변경을 묶어서 검사 |
| `src/core/settings.ts` | 모든 설정 타입, 기본값, 복합 토글, 허용값 정규화 |
| `src/core/messages.ts` | background/content/page 사이 메시지 타입 계약 |
| `src/core/feature.ts` | 기능의 `start/update/scan/stop` 계약과 오류 격리 레지스트리 |
| `src/features/sharpness.ts` | 화면 선명도 필터와 플레이어 설정 메뉴 UI |
| `src/features/playback-bar.ts` | 기본 진행 막대 교체, 되돌려 볼 수 있는 구간과 위치 이동 |
| `src/features/stream-stats.ts` | 스트림 품질 측정, 통계 오버레이, 우클릭 메뉴 |
| `src/features/screenshot.ts` | 보이는 탭 캡처, 영상 영역 계산, PNG 저장 |
| `src/features/ad-ui.ts` | 광고 건너뛰기 버튼과 차단 감지 팝업 처리 |
| `src/features/chat-style.ts` | 순위권 채팅 숨김 CSS 상태 관리 |
| `src/page/index.ts` | 치지직 사이트 내부에서 실행할 기능의 시작점 |
| `src/page/network.ts` | 광고 요청 대체와 JSON 응답 수정 |
| `src/page/player.ts` | 선호 화질, 플레이어 상태, 레이턴시, 라이브 탐색 제어 |
| `src/page/blinded.ts` | React 채팅 데이터에서 블라인드 원문 탐색과 복구 |
| `src/page/globals.d.ts` | 치지직 비공개 플레이어 연결점과 중복 실행 방지 표시 선언 |
| `src/popup/index.ts` | 팝업 설정 입력, 저장, 활성 탭 상태 갱신 |

### 정적 리소스

| 파일 | 역할 |
|---|---|
| `public/manifest.json` | 권한, 대상 사이트, 백그라운드, 콘텐츠 스크립트, 팝업 선언 |
| `public/popup.html` | 툴바 팝업의 설정과 플레이어 상태 마크업 |
| `public/styles/popup.css` | 팝업 레이아웃과 CHZZK 색상 디자인 |
| `public/styles/content.css` | 재생바, 통계, Toast, 채팅, 플레이어 통합 UI 스타일 |
| `public/images/toolbar-icon.svg` | Safari 툴바 아이콘 |
| `public/images/icon-*.png` | Manifest와 Safari에서 사용하는 확장 아이콘 크기별 파일 |
| `public/_locales/en/messages.json` | Safari WebExtension 기본 로케일 메시지 |

### 빌드 결과

```text
src/background/index.ts ─┐
src/content/index.ts ────┼─ esbuild ─ WebExtension/dist/
src/page/index.ts ───────┤              ├─ background.js
src/popup/index.ts ──────┘              ├─ content.js
public/* ────────────────────────────────├─ page.js
                                        ├─ popup.js
                                        └─ manifest·HTML·CSS·images

Xcode Build
  └─ Bundle Web Extension
       ├─ Debug   → 비압축 JavaScript + 인라인 소스맵
       └─ Release → 압축 JavaScript + 소스맵 제외
```

## 참고

- CHZZK Plus는 **치지직 및 NAVER와 관련 없는 비공식 개인 프로젝트**입니다.
- 치지직의 DOM, 비공개 플레이어 객체, 네트워크 응답 구조가 변경되면 일부 기능이
  일시적으로 동작하지 않을 수 있습니다.
- 광고 차단은 알려진 치지직 및 Veta 요청과 응답을 대상으로 하며 모든 형태의
  광고를 영구적으로 보장하지 않습니다.
- 라이브 뒤로가기는 Safari와 해당 방송이 실제로 탐색 가능한 `seekable` 또는
  `buffered` 미디어 구간을 제공할 때만 동작합니다.
- 블라인드 원문 복구는 브라우저에 이미 전달된 원문이 React 데이터에 남아 있을
  때만 가능하며, 서버가 원문 자체를 보내지 않은 메시지는 복구할 수 없습니다.
- 스크린샷은 Safari의 탭 캡처 권한과 현재 보이는 영역을 사용합니다. 보호된 영상,
  다른 창에 가려진 영역, 권한이 없는 탭에서는 제한될 수 있습니다.
- `WebExtension/dist`와 Xcode의 빌드 결과물은 자동 생성 파일입니다. 기능 수정은
  항상 `WebExtension/src` 또는 `WebExtension/public`에서 해야 합니다.

## 라이선스

이 프로젝트는 [MIT License](LICENSE)로 배포됩니다.

<div align="center">
  <sub>Made for CHZZK on Safari · <code>#00FFA3</code></sub>
</div>
