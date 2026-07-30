/**
 * Browser-side resumable Google Drive upload.
 * File bytes go directly to Google — never proxied through Next.js.
 */

export type DriveUploadProgress = {
  pct: number;
  loadedBytes: number;
  totalBytes: number;
};

export type DriveUploadResult = {
  fileId: string;
  name?: string;
};

export type UploadVideoToDriveOptions = {
  accessToken: string;
  file: File;
  /** Destination folder id (game `raw/`). */
  parentFolderId: string;
  /** File name in Drive. */
  name: string;
  onProgress?: (progress: DriveUploadProgress) => void;
  signal?: AbortSignal;
};

async function initiateResumableUpload(
  opts: UploadVideoToDriveOptions,
): Promise<string> {
  const mime = opts.file.type || "video/mp4";
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(opts.file.size),
        "X-Upload-Content-Type": mime,
      },
      body: JSON.stringify({
        name: opts.name,
        parents: [opts.parentFolderId],
      }),
      signal: opts.signal,
    },
  );

  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(
      detail
        ? `Drive upload setup failed: ${detail}`
        : `Drive upload setup failed (${res.status}).`,
    );
  }

  const location = res.headers.get("Location");
  if (!location) {
    throw new Error("Drive did not return an upload URL.");
  }
  return location;
}

function putFileToUploadSession(
  uploadUrl: string,
  file: File,
  onProgress?: (progress: DriveUploadProgress) => void,
  signal?: AbortSignal,
): Promise<DriveUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

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
            name?: string;
          };
          const fileId = typeof data.id === "string" ? data.id.trim() : "";
          if (!fileId) {
            reject(new Error("Upload succeeded but no file id was returned."));
            return;
          }
          resolve({
            fileId,
            ...(typeof data.name === "string" ? { name: data.name } : {}),
          });
        } catch {
          reject(new Error("Invalid response from Drive after upload."));
        }
        return;
      }
      const detail = xhr.responseText?.slice(0, 200) ?? "";
      reject(
        new Error(
          detail
            ? `Drive upload failed (${xhr.status}): ${detail}`
            : `Drive upload failed (${xhr.status}).`,
        ),
      );
    };

    xhr.onerror = () => reject(new Error("Upload network error."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

/** Resumable Drive file upload from the browser into a parent folder. */
export async function uploadVideoToDrive(
  opts: UploadVideoToDriveOptions,
): Promise<DriveUploadResult> {
  const uploadUrl = await initiateResumableUpload(opts);
  return putFileToUploadSession(
    uploadUrl,
    opts.file,
    opts.onProgress,
    opts.signal,
  );
}
