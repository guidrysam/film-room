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

/** Search discoverable clubs and request to join as parent or coach. */
export function clubsFindUrl(): string {
  return "/clubs/find";
}
