/**
 * Marks this browser tab as the host for a room (sessionStorage, same tab only).
 * Call before navigating to /room/[id] after creating a session from the homepage.
 */
export const ROOM_HOST_SESSION_PREFIX = "film-room-host:";

const hostStoreListeners = new Set<() => void>();

/** Used by `useRoomHostFromSession` so React re-renders after `markRoomHost` (same-tab sessionStorage does not fire `storage` events). */
export function subscribeToRoomHostStore(onStoreChange: () => void): () => void {
  hostStoreListeners.add(onStoreChange);
  return () => {
    hostStoreListeners.delete(onStoreChange);
  };
}

function notifyRoomHostStore(): void {
  hostStoreListeners.forEach((fn) => {
    fn();
  });
}

export function markRoomHost(roomId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${ROOM_HOST_SESSION_PREFIX}${roomId}`, "1");
    notifyRoomHostStore();
  } catch {
    /* quota / private mode */
  }
}

export function isRoomHost(roomId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(`${ROOM_HOST_SESSION_PREFIX}${roomId}`) === "1";
  } catch {
    return false;
  }
}

export function buildViewerRoomUrl(
  origin: string,
  roomId: string,
  videoId: string,
): string {
  const params = new URLSearchParams({ video: videoId });
  return `${origin}/room/${roomId}?${params.toString()}`;
}
