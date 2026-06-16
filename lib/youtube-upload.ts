/**
 * Browser-side resumable YouTube upload via `videos.insert`.
 * File bytes go directly to Google — never proxied through Next.js.
 */

export type YouTubeUploadMetadata = {
  title: string;
  description: string;
};

export type YouTubeUploadProgress = {
  /** 0–100 */
  pct: number;
  loadedBytes: number;
  totalBytes: number;
};

export type YouTubeUploadResult = {
  videoId: string;
  uploadStatus?: string;
};

export type UploadVideoToYouTubeOptions = {
  accessToken: string;
  file: File;
  metadata: YouTubeUploadMetadata;
  onProgress?: (progress: YouTubeUploadProgress) => void;
  signal?: AbortSignal;
};

const UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

async function initiateResumableUpload(
  accessToken: string,
  file: File,
  metadata: YouTubeUploadMetadata,
): Promise<string> {
  const res = await fetch(UPLOAD_INIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(file.size),
      "X-Upload-Content-Type": file.type || "video/*",
    },
    body: JSON.stringify({
      snippet: {
        title: metadata.title,
        description: metadata.description,
        categoryId: "17",
      },
      status: {
        privacyStatus: "unlisted",
        embeddable: true,
        selfDeclaredMadeForKids: false,
      },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as {
        error?: { message?: string };
      };
      detail = err.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(
      detail
        ? `YouTube upload setup failed: ${detail}`
        : `YouTube upload setup failed (${res.status}).`,
    );
  }

  const location = res.headers.get("Location");
  if (!location) {
    throw new Error("YouTube did not return an upload URL.");
  }
  return location;
}

function putFileToUploadSession(
  uploadUrl: string,
  file: File,
  onProgress?: (progress: YouTubeUploadProgress) => void,
  signal?: AbortSignal,
): Promise<YouTubeUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "video/*");

    if (signal) {
      if (signal.aborted) {
        reject(new Error("Upload cancelled."));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      const total = e.lengthComputable ? e.total : file.size;
      const pct =
        total > 0 ? Math.min(100, Math.round((e.loaded / total) * 100)) : 0;
      onProgress({ pct, loadedBytes: e.loaded, totalBytes: total });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            id?: string;
            status?: { uploadStatus?: string };
          };
          const videoId = typeof data.id === "string" ? data.id.trim() : "";
          if (!videoId) {
            reject(new Error("Upload succeeded but no video id was returned."));
            return;
          }
          resolve({
            videoId,
            ...(typeof data.status?.uploadStatus === "string"
              ? { uploadStatus: data.status.uploadStatus }
              : {}),
          });
        } catch {
          reject(new Error("Invalid response from YouTube after upload."));
        }
        return;
      }
      const detail = xhr.responseText?.slice(0, 200) ?? "";
      reject(
        new Error(
          detail
            ? `YouTube upload failed (${xhr.status}): ${detail}`
            : `YouTube upload failed (${xhr.status}).`,
        ),
      );
    };

    xhr.onerror = () => reject(new Error("Upload network error."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

/** Resumable `videos.insert` upload from the browser. */
export async function uploadVideoToYouTube(
  opts: UploadVideoToYouTubeOptions,
): Promise<YouTubeUploadResult> {
  const uploadUrl = await initiateResumableUpload(
    opts.accessToken,
    opts.file,
    opts.metadata,
  );
  return putFileToUploadSession(
    uploadUrl,
    opts.file,
    opts.onProgress,
    opts.signal,
  );
}

/** Build the standard Game Cap upload title. */
export function buildYouTubeUploadTitle(gameTitle: string, label: string): string {
  const g = gameTitle.trim() || "Game";
  const l = label.trim() || "Camera";
  return `${g} — ${l}`;
}

/** Build the standard Game Cap upload description. */
export function buildYouTubeUploadDescription(input: {
  teamName?: string;
  gameTitle: string;
  date?: string;
}): string {
  const lines = [
    input.teamName ? `Team: ${input.teamName.trim()}` : null,
    `Game: ${input.gameTitle.trim() || "Game"}`,
    input.date ? `Date: ${input.date.trim()}` : null,
    "",
    "Uploaded via Film Room Game Cap",
  ].filter((line) => line !== null);
  return lines.join("\n");
}
