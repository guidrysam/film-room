/**
 * Export tactics board SVG to PNG / share / print-as-PDF.
 */

import type { RefObject } from "react";

function svgToDataUrl(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

export async function tacticsSvgToPngBlob(
  svg: SVGSVGElement,
  scale = 2,
): Promise<Blob> {
  const vb = svg.viewBox.baseVal;
  const w = vb.width || svg.clientWidth || 1050;
  const h = vb.height || svg.clientHeight || 680;
  const dataUrl = svgToDataUrl(svg);

  const img = new Image();
  img.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not rasterize board."));
  });
  img.src = dataUrl;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG export failed."));
      },
      "image/png",
      0.95,
    );
  });
}

export async function downloadTacticsPng(
  svgRef: RefObject<SVGSVGElement | null>,
  filename: string,
): Promise<void> {
  const svg = svgRef.current;
  if (!svg) throw new Error("Board is not ready to export.");
  const blob = await tacticsSvgToPngBlob(svg);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/[^a-z0-9-_]+/gi, "-") || "tactics"}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Share image via Web Share API when available; otherwise download PNG. */
export async function shareTacticsImage(
  svgRef: RefObject<SVGSVGElement | null>,
  title: string,
): Promise<"shared" | "downloaded"> {
  const svg = svgRef.current;
  if (!svg) throw new Error("Board is not ready to share.");
  const blob = await tacticsSvgToPngBlob(svg);
  const file = new File([blob], `${title || "tactics"}.png`, {
    type: "image/png",
  });
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare({ files: [file] }))
  ) {
    try {
      await navigator.share({
        title: title || "Tactics board",
        files: [file],
      });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/** Open a print window with the board image (Save as PDF from the browser). */
export async function exportTacticsPdfViaPrint(
  svgRef: RefObject<SVGSVGElement | null>,
  title: string,
): Promise<void> {
  const svg = svgRef.current;
  if (!svg) throw new Error("Board is not ready to export.");
  const blob = await tacticsSvgToPngBlob(svg, 2);
  const url = URL.createObjectURL(blob);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked. Allow pop-ups to export PDF.");
  }
  win.document.write(`<!doctype html><html><head><title>${title.replace(/</g, "")}</title>
<style>
  @page { margin: 12mm; }
  html, body { margin: 0; background: #111; }
  img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
  h1 { font: 600 16px system-ui; color: #eee; text-align: center; margin: 12px; }
</style></head><body>
<h1>${title.replace(/</g, "")}</h1>
<img src="${url}" alt="Tactics board" onload="setTimeout(function(){window.print();},200)" />
</body></html>`);
  win.document.close();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
