import { youtubeErrorReason } from "@/lib/youtube-api-error-diagnostic";

const LOG_TAG = "YOUTUBE_EMBED_REPAIR";

export const EMBED_NOT_ALLOWED_MESSAGE =
  "YouTube did not allow this channel/broadcast to be embedded.";

const EMBED_LOCKED_MESSAGE =
  "Broadcast is already testing/live; embedding can no longer be changed via the API.";

export type EnsureEmbeddableReason =
  | "already"
  | "updated"
  | "locked"
  | "rejected"
  | "not_found"
  | "error";

export type EnsureEmbeddableResult = {
  /** true/false when known, null when it could not be determined. */
  embeddable: boolean | null;
  lifeCycleStatus: string | null;
  attemptedUpdate: boolean;
  updated: boolean;
  /** YouTube actively refused enableEmbed (invalidEmbedSetting). */
  embedRejected: boolean;
  reason: EnsureEmbeddableReason;
  message?: string;
};

type MonitorStream = {
  enableMonitorStream?: boolean;
  broadcastStreamDelayMs?: number;
};

type BroadcastContentDetails = {
  enableEmbed?: boolean;
  enableDvr?: boolean;
  recordFromStart?: boolean;
  latencyPreference?: string;
  enableAutoStart?: boolean;
  enableAutoStop?: boolean;
  closedCaptionsType?: string;
  enableContentEncryption?: boolean;
  startWithSlate?: boolean;
  projection?: string;
  monitorStream?: MonitorStream;
};

type BroadcastItem = {
  id?: string;
  status?: { lifeCycleStatus?: string };
  contentDetails?: BroadcastContentDetails;
};

type ListResponse = { items?: BroadcastItem[] };

/** Lifecycle states where enableEmbed can no longer be changed via the API. */
const LOCKED_LIFECYCLES = new Set([
  "testing",
  "live",
  "livestarting",
  "complete",
  "completestarting",
]);

function log(event: string, fields: Record<string, unknown>): void {
  // Never logs OAuth tokens or stream keys — only broadcast metadata.
  console.log(LOG_TAG, JSON.stringify({ event, ...fields }));
}

async function getBroadcast(
  token: string,
  broadcastId: string,
): Promise<
  | { ok: true; item: BroadcastItem | null }
  | { ok: false; error: unknown }
> {
  const url =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
    `?part=snippet,status,contentDetails&id=${encodeURIComponent(broadcastId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, error: err };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) return { ok: false, error: data };
  const item = (data as ListResponse).items?.[0] ?? null;
  return { ok: true, item };
}

/** Build an update body that only carries known-mutable contentDetails fields. */
function mutableContentDetails(
  cd: BroadcastContentDetails | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { enableEmbed: true };
  // enableEmbed/enableDvr/recordFromStart must be set when the part includes
  // contentDetails; default DVR + record-from-start on so we don't clobber them.
  out.enableDvr = typeof cd?.enableDvr === "boolean" ? cd.enableDvr : true;
  out.recordFromStart =
    typeof cd?.recordFromStart === "boolean" ? cd.recordFromStart : true;
  if (typeof cd?.latencyPreference === "string")
    out.latencyPreference = cd.latencyPreference;
  if (typeof cd?.enableAutoStart === "boolean")
    out.enableAutoStart = cd.enableAutoStart;
  if (typeof cd?.enableAutoStop === "boolean")
    out.enableAutoStop = cd.enableAutoStop;
  if (typeof cd?.closedCaptionsType === "string")
    out.closedCaptionsType = cd.closedCaptionsType;
  if (typeof cd?.enableContentEncryption === "boolean")
    out.enableContentEncryption = cd.enableContentEncryption;
  if (typeof cd?.startWithSlate === "boolean")
    out.startWithSlate = cd.startWithSlate;
  if (typeof cd?.projection === "string") out.projection = cd.projection;
  if (cd?.monitorStream && typeof cd.monitorStream === "object") {
    const ms: Record<string, unknown> = {};
    if (typeof cd.monitorStream.enableMonitorStream === "boolean")
      ms.enableMonitorStream = cd.monitorStream.enableMonitorStream;
    if (typeof cd.monitorStream.broadcastStreamDelayMs === "number")
      ms.broadcastStreamDelayMs = cd.monitorStream.broadcastStreamDelayMs;
    if (Object.keys(ms).length > 0) out.monitorStream = ms;
  }
  return out;
}

/**
 * Verify (and, when still pre-live, repair) `contentDetails.enableEmbed` for a
 * broadcast so Film Room can embed it. Never throws — always resolves a result
 * the caller can fold into its response without breaking the stream flow.
 *
 * Only `part=contentDetails` is updated, which leaves snippet + status fully
 * preserved (parts not included in an update are never overwritten).
 */
export async function ensureBroadcastEmbeddable(
  token: string,
  broadcastId: string,
): Promise<EnsureEmbeddableResult> {
  const got = await getBroadcast(token, broadcastId);
  if (!got.ok) {
    log("error", {
      broadcastId,
      stage: "get",
      reason: youtubeErrorReason(got.error),
    });
    return {
      embeddable: null,
      lifeCycleStatus: null,
      attemptedUpdate: false,
      updated: false,
      embedRejected: false,
      reason: "error",
    };
  }

  const item = got.item;
  if (!item) {
    log("error", { broadcastId, stage: "get", reason: "not_found" });
    return {
      embeddable: null,
      lifeCycleStatus: null,
      attemptedUpdate: false,
      updated: false,
      embedRejected: false,
      reason: "not_found",
    };
  }

  const lifeCycleStatus =
    typeof item.status?.lifeCycleStatus === "string"
      ? item.status.lifeCycleStatus.trim()
      : null;

  if (item.contentDetails?.enableEmbed === true) {
    return {
      embeddable: true,
      lifeCycleStatus,
      attemptedUpdate: false,
      updated: false,
      embedRejected: false,
      reason: "already",
    };
  }

  const lc = (lifeCycleStatus ?? "").toLowerCase();
  if (LOCKED_LIFECYCLES.has(lc)) {
    log("skipped_locked", { broadcastId, lifeCycleStatus });
    return {
      embeddable: false,
      lifeCycleStatus,
      attemptedUpdate: false,
      updated: false,
      embedRejected: false,
      reason: "locked",
      message: EMBED_LOCKED_MESSAGE,
    };
  }

  log("attempt", { broadcastId, lifeCycleStatus });
  const updateUrl =
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=contentDetails";
  const updateBody = {
    id: broadcastId,
    contentDetails: mutableContentDetails(item.contentDetails),
  };

  let putRes: Response;
  try {
    putRes = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateBody),
      cache: "no-store",
    });
  } catch (err) {
    log("error", {
      broadcastId,
      lifeCycleStatus,
      stage: "update",
      reason: err instanceof Error ? err.message : "fetch_failed",
    });
    return {
      embeddable: false,
      lifeCycleStatus,
      attemptedUpdate: true,
      updated: false,
      embedRejected: false,
      reason: "error",
    };
  }

  let putData: unknown = null;
  try {
    putData = await putRes.json();
  } catch {
    putData = null;
  }

  if (!putRes.ok) {
    const reason = youtubeErrorReason(putData);
    if (reason === "invalidEmbedSetting") {
      log("rejected", { broadcastId, lifeCycleStatus, reason });
      return {
        embeddable: false,
        lifeCycleStatus,
        attemptedUpdate: true,
        updated: false,
        embedRejected: true,
        reason: "rejected",
        message: EMBED_NOT_ALLOWED_MESSAGE,
      };
    }
    log("error", { broadcastId, lifeCycleStatus, stage: "update", reason });
    return {
      embeddable: false,
      lifeCycleStatus,
      attemptedUpdate: true,
      updated: false,
      embedRejected: false,
      reason: "error",
    };
  }

  // Verify with a fresh read; fall back to the PUT echo.
  const verify = await getBroadcast(token, broadcastId);
  const verifyEmbed = verify.ok
    ? verify.item?.contentDetails?.enableEmbed
    : undefined;
  const putEmbed = (putData as BroadcastItem | null)?.contentDetails?.enableEmbed;
  const finalEmbeddable = verifyEmbed === true || putEmbed === true;
  log("succeeded", { broadcastId, lifeCycleStatus, embeddable: finalEmbeddable });
  return {
    embeddable: finalEmbeddable,
    lifeCycleStatus,
    attemptedUpdate: true,
    updated: true,
    embedRejected: false,
    reason: "updated",
  };
}
