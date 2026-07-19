declare global {
  interface Element { __vue__?: any; }
}

export interface VideoTrack {
  id?: string | number; label?: string; height?: number; bitrate?: number; videoBitrate?: number;
  selected?: boolean; isSelected?: boolean; _selected?: boolean;
  codec?: string; videoCodec?: string; mimeType?: string;
}

export function findVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(".pzp-pc video.webplayer-internal-video")
    || document.querySelector<HTMLVideoElement>("video.webplayer-internal-video")
    || document.querySelector<HTMLVideoElement>(".pzp-pc video")
    || document.querySelector<HTMLVideoElement>("video");
}

export function findPlayerRoot(): any {
  const host = document.querySelector(".pzp, .pzp-pc") || findVideo()?.parentElement;
  if (!host) return null;
  if (host.__vue__) return host.__vue__;
  for (const element of host.querySelectorAll("*")) if (element.__vue__) return element.__vue__;
  return null;
}

export function findPlayerCore(node: any, depth = 0, visited = new Set<any>()): any {
  if (!node || depth > 12 || visited.has(node)) return null;
  visited.add(node);
  if (typeof node.getVideoTracksList === "function") return node;
  for (const child of node.$children || []) {
    const found = findPlayerCore(child, depth + 1, visited);
    if (found) return found;
  }
  return node.player && typeof node.player.getVideoTracksList === "function" ? node.player : null;
}

export function readTracks(core: any): VideoTrack[] {
  try {
    return Object.values(core?.getVideoTracksList?.() || {})
      .filter((track): track is VideoTrack => Boolean(track) && typeof track === "object");
  } catch { return []; }
}

export function selectedTrack(tracks: VideoTrack[]): VideoTrack | undefined {
  return tracks.find((track) => track._selected || track.selected || track.isSelected);
}
