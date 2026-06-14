import { NextResponse } from "next/server";

const LOG_TAG = "YOUTUBE_API_ERROR_DIAGNOSTIC";

export type YoutubeApiErrorDiagnosticLog = {
  route: string;
  endpoint: string;
  status: number;
  statusText: string;
  errorCode: number | null;
  message: string | null;
  reason: string | null;
  domain: string | null;
  location: string | null;
  locationType: string | null;
  details: unknown;
};

type GoogleErrorShape = {
  error?: {
    code?: unknown;
    message?: unknown;
    errors?: unknown;
    details?: unknown;
    status?: unknown;
  };
};

function parseGoogleYoutubeErrorBody(body: unknown): {
  errorCode: number | null;
  message: string | null;
  reason: string | null;
  domain: string | null;
  location: string | null;
  locationType: string | null;
  details: unknown;
  rawError: unknown;
} {
  if (!body || typeof body !== "object") {
    return {
      errorCode: null,
      message: null,
      reason: null,
      domain: null,
      location: null,
      locationType: null,
      details: undefined,
      rawError: body,
    };
  }

  const root = body as GoogleErrorShape;
  const err = root.error;
  if (!err || typeof err !== "object") {
    return {
      errorCode: null,
      message: null,
      reason: null,
      domain: null,
      location: null,
      locationType: null,
      details: undefined,
      rawError: body,
    };
  }

  const e = err as {
    code?: unknown;
    message?: unknown;
    errors?: unknown;
    details?: unknown;
  };

  const errorCode =
    typeof e.code === "number" && Number.isFinite(e.code) ? e.code : null;
  const message =
    typeof e.message === "string" && e.message.trim() !== ""
      ? e.message.trim()
      : null;
  const details = e.details;

  const firstRaw = Array.isArray(e.errors) ? e.errors[0] : undefined;
  const first =
    firstRaw && typeof firstRaw === "object"
      ? (firstRaw as Record<string, unknown>)
      : null;

  /** Only use `errors[].reason` — do not infer quota from HTTP or other fields. */
  const reason =
    first && typeof first.reason === "string" && first.reason.trim() !== ""
      ? first.reason.trim()
      : null;

  const domain =
    first && typeof first.domain === "string" && first.domain.trim() !== ""
      ? first.domain.trim()
      : null;
  const location =
    first && typeof first.location === "string" && first.location.trim() !== ""
      ? first.location.trim()
      : null;
  const locationType =
    first &&
    typeof first.locationType === "string" &&
    first.locationType.trim() !== ""
      ? first.locationType.trim()
      : null;

  return {
    errorCode,
    message,
    reason,
    domain,
    location,
    locationType,
    details,
    rawError: body,
  };
}

export function logYoutubeApiErrorDiagnostic(
  diagnostic: YoutubeApiErrorDiagnosticLog,
): void {
  console.error(LOG_TAG, JSON.stringify(diagnostic));
}

/**
 * Extract the Google API `errors[].reason` from a raw error body (e.g.
 * "invalidEmbedSetting", "quotaExceeded"). Returns null when absent.
 */
export function youtubeErrorReason(rawBody: unknown): string | null {
  return parseGoogleYoutubeErrorBody(rawBody).reason;
}

/**
 * Parse Google JSON error body, log a single diagnostic line, return a NextResponse.
 */
export function youtubeApiErrorNextResponse(args: {
  route: string;
  endpoint: string;
  httpStatus: number;
  httpStatusText: string;
  rawBody: unknown;
  /** Merged into JSON (e.g. broadcastId). Do not set ok. */
  extra?: Record<string, unknown>;
  /** Outgoing HTTP status for this route (default 502). */
  responseStatus?: number;
}): NextResponse {
  const {
    route,
    endpoint,
    httpStatus,
    httpStatusText,
    rawBody,
    extra,
    responseStatus = 502,
  } = args;

  const parsed = parseGoogleYoutubeErrorBody(rawBody);

  logYoutubeApiErrorDiagnostic({
    route,
    endpoint,
    status: httpStatus,
    statusText: httpStatusText,
    errorCode: parsed.errorCode,
    message: parsed.message,
    reason: parsed.reason,
    domain: parsed.domain,
    location: parsed.location,
    locationType: parsed.locationType,
    details: parsed.details,
  });

  return NextResponse.json(
    {
      ok: false,
      route,
      status: httpStatus,
      errorCode: parsed.errorCode,
      message: parsed.message,
      reason: parsed.reason,
      domain: parsed.domain,
      location: parsed.location,
      locationType: parsed.locationType,
      rawError: parsed.rawError,
      ...extra,
    },
    { status: responseStatus },
  );
}

/** When you have the `Response` from `fetch` and already parsed JSON body. */
export function youtubeApiErrorNextResponseFromFetch(args: {
  route: string;
  /** Log/JSON endpoint (redact secrets — e.g. API keys in query). */
  endpoint: string;
  res: Response;
  rawBody: unknown;
  extra?: Record<string, unknown>;
  responseStatus?: number;
}): NextResponse {
  return youtubeApiErrorNextResponse({
    route: args.route,
    endpoint: args.endpoint,
    httpStatus: args.res.status,
    httpStatusText: args.res.statusText,
    rawBody: args.rawBody,
    extra: args.extra,
    responseStatus: args.responseStatus,
  });
}

/** Log only (e.g. optional secondary API call failed). */
export function logYoutubeApiErrorFromParts(args: {
  route: string;
  endpoint: string;
  httpStatus: number;
  httpStatusText: string;
  rawBody: unknown;
}): void {
  const parsed = parseGoogleYoutubeErrorBody(args.rawBody);
  logYoutubeApiErrorDiagnostic({
    route: args.route,
    endpoint: args.endpoint,
    status: args.httpStatus,
    statusText: args.httpStatusText,
    errorCode: parsed.errorCode,
    message: parsed.message,
    reason: parsed.reason,
    domain: parsed.domain,
    location: parsed.location,
    locationType: parsed.locationType,
    details: parsed.details,
  });
}
