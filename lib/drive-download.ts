/**
 * Download a Drive file into a browser File for YouTube proxy upload.
 */

export async function downloadDriveFileAsBlob(opts: {
  accessToken: string;
  driveFileId: string;
  signal?: AbortSignal;
}): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(opts.driveFileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      signal: opts.signal,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text
        ? `Drive download failed (${res.status}): ${text.slice(0, 200)}`
        : `Drive download failed (${res.status}).`,
    );
  }
  return res.blob();
}

export async function downloadDriveFileAsFile(opts: {
  accessToken: string;
  driveFileId: string;
  fileName: string;
  mimeType?: string;
  signal?: AbortSignal;
}): Promise<File> {
  const blob = await downloadDriveFileAsBlob(opts);
  return new File([blob], opts.fileName, {
    type: opts.mimeType || blob.type || "video/mp4",
  });
}
