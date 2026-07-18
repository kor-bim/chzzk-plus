#!/bin/sh
set -eu

WEB_EXTENSION_DIR="$SRCROOT/WebExtension"
DIST_DIR="$WEB_EXTENSION_DIR/dist"
OUTPUT_DIR="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"

NPM_BIN=""
if command -v npm >/dev/null 2>&1; then
  NPM_BIN="$(command -v npm)"
elif [ -x /opt/homebrew/bin/npm ]; then
  NPM_BIN=/opt/homebrew/bin/npm
elif [ -x /usr/local/bin/npm ]; then
  NPM_BIN=/usr/local/bin/npm
elif [ -d "$HOME/.nvm/versions/node" ]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/npm; do
    if [ -x "$candidate" ]; then NPM_BIN="$candidate"; fi
  done
fi

if [ -z "$NPM_BIN" ]; then
  echo "error: npm을 찾지 못했습니다. Node.js 설치 후 WebExtension에서 npm install을 실행하세요."
  exit 1
fi

PATH="$(dirname "$NPM_BIN"):$PATH"
export PATH

if [ ! -d "$WEB_EXTENSION_DIR/node_modules" ]; then
  echo "error: WebExtension/node_modules가 없습니다. 먼저 npm install을 실행하세요."
  exit 1
fi

# Xcode의 Debug 빌드는 읽기 쉬운 비압축 번들과 소스맵을 생성하고,
# Release 빌드는 배포용 압축 번들을 생성한다.
MODE=production
if [ "$CONFIGURATION" = Debug ]; then MODE=development; fi

cd "$WEB_EXTENSION_DIR"
"$NPM_BIN" run build -- --mode="$MODE"

# Xcode packages only the verified bundle output, never the TypeScript sources.
/bin/rm -rf "$OUTPUT_DIR"
/bin/mkdir -p "$OUTPUT_DIR"
/usr/bin/ditto "$DIST_DIR" "$OUTPUT_DIR"
