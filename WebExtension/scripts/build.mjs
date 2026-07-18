import { context } from "esbuild";
import { cp, mkdir, rm, watch as watchFiles } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(projectRoot, "public");

function readOption(name, fallback) {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const watch = process.argv.includes("--watch");
const mode = readOption("--mode", "production");
// xcode-build.sh가 Debug에는 development, Release에는 production을 전달한다.
const development = mode === "development";
const outdir = path.resolve(projectRoot, readOption("--outdir", "dist"));

if (outdir === path.parse(outdir).root || outdir === projectRoot || !path.isAbsolute(outdir)) {
  throw new Error(`안전하지 않은 출력 경로입니다: ${outdir}`);
}

async function copyPublic() {
  await mkdir(outdir, { recursive: true });
  await cp(publicDir, outdir, {
    recursive: true,
    force: true,
    // Finder 메타파일은 Safari 확장 리소스가 아니므로 산출물에 포함하지 않습니다.
    filter: (source) => path.basename(source) !== ".DS_Store"
  });
}

await rm(outdir, { recursive: true, force: true });
await copyPublic();

const buildContext = await context({
  absWorkingDir: projectRoot,
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    page: "src/page/index.ts",
    popup: "src/popup/index.ts"
  },
  outdir,
  entryNames: "[name]",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["safari18"],
  // Debug: 디버깅하기 쉬운 비압축 코드와 인라인 소스맵을 생성한다.
  // Release: 배포 크기를 줄이기 위해 코드를 압축하고 소스맵을 제외한다.
  minify: !development,
  sourcemap: development ? "inline" : false,
  legalComments: "none",
  treeShaking: true,
  logLevel: "info"
});

if (watch) {
  await buildContext.watch();
  const publicWatcher = watchFiles(publicDir, { recursive: true });
  for await (const event of publicWatcher) {
    await copyPublic();
    console.log(`[public] ${event.eventType}: ${event.filename ?? ""}`);
  }
} else {
  await buildContext.rebuild();
  await buildContext.dispose();
}
