export function isLiveRoute(pathname = location.pathname): boolean {
  return /^\/live\//.test(pathname);
}

export function isVodRoute(pathname = location.pathname): boolean {
  return /^\/video\/\d+/.test(pathname);
}
