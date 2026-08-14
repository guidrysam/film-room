/** Shared club hub URL builders. */

export function clubHubUrl(clubId: string): string {
  return `/club/${clubId}`;
}

export function clubNewUrl(): string {
  return "/club/new";
}

export function clubJoinUrl(code: string): string {
  return `/join/club/${code}`;
}

/** Parent: search discoverable clubs and request to join. */
export function clubsFindUrl(): string {
  return "/clubs/find";
}
