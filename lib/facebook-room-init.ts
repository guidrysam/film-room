/** Session-only bridge: host paste carries full Facebook href into room init. */

const PREFIX = "film-room-fb-init:";

export type FacebookRoomInit = {
  videoKey: string;
  href: string;
};

export function storeFacebookRoomInit(
  roomId: string,
  init: FacebookRoomInit,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${PREFIX}${roomId}`, JSON.stringify(init));
  } catch {
    /* quota / private mode */
  }
}

export function consumeFacebookRoomInit(
  roomId: string,
): FacebookRoomInit | null {
  if (typeof sessionStorage === "undefined") return null;
  const key = `${PREFIX}${roomId}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as FacebookRoomInit;
    if (
      typeof parsed.videoKey === "string" &&
      parsed.videoKey.trim() &&
      typeof parsed.href === "string" &&
      parsed.href.trim()
    ) {
      return { videoKey: parsed.videoKey.trim(), href: parsed.href.trim() };
    }
  } catch {
    sessionStorage.removeItem(key);
  }
  return null;
}
