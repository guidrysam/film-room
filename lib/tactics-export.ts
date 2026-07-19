/**
 * Export tactics board SVG to PNG / share / print-as-PDF.
 */

import type { RefObject } from "react";
import type {
  TacticsBoardObject,
  TacticsFieldOrientation,
  TacticsFieldView,
} from "@/lib/tactics-boards";
import {
  TACTICS_AWAY_COLOR,
  TACTICS_HOME_COLOR,
} from "@/lib/tactics-boards";
import { zoneFillColor, zoneStrokeColor } from "@/lib/tactics-colors";
import { viewBoxAttr } from "@/lib/tactics-field-geometry";
import { normToSvg } from "@/lib/tactics-field-geometry";

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

function objectsToSimpleSvg(
  objects: TacticsBoardObject[],
  orientation: TacticsFieldOrientation,
  fieldView: TacticsFieldView,
): string {
  const vb = viewBoxAttr(orientation, fieldView);
  const escapeXml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const tokens = objects
    .map((o) => {
      if (o.type === "player") {
        const p = normToSvg(o.x, o.y, orientation);
        const color =
          o.color ||
          (o.team === "home" ? TACTICS_HOME_COLOR : TACTICS_AWAY_COLOR);
        return `<circle cx="${p.x}" cy="${p.y}" r="22" fill="${color}" stroke="#fff" stroke-width="2"/><text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="18" font-family="system-ui">${o.label}</text>`;
      }
      if (o.type === "ball") {
        const p = normToSvg(o.x, o.y, orientation);
        return `<circle cx="${p.x}" cy="${p.y}" r="10" fill="#f5f5f4" stroke="#292524"/>`;
      }
      if (o.type === "cone") {
        const p = normToSvg(o.x, o.y, orientation);
        const color = o.color || "#f97316";
        return `<path d="M ${p.x} ${p.y - 16} L ${p.x + 11} ${p.y + 11} L ${p.x - 11} ${p.y + 11} Z" fill="${color}" stroke="#fff" stroke-width="2"/>`;
      }
      if (o.type === "mini_goal") {
        const p = normToSvg(o.x, o.y, orientation);
        return `<g transform="translate(${p.x} ${p.y}) rotate(${o.rotation ?? 0})"><path d="M -30 0 V -25 H 30 V 0 M -30 -25 L -20 -15 H 20 L 30 -25" fill="none" stroke="#fff" stroke-width="5"/></g>`;
      }
      if (o.type === "area_label") {
        const p = normToSvg(o.x, o.y, orientation);
        return `<rect x="${p.x - 55}" y="${p.y - 16}" width="110" height="32" rx="7" fill="rgba(0,0,0,.65)" stroke="rgba(255,255,255,.5)"/><text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="15" font-family="system-ui">${escapeXml(o.text)}</text>`;
      }
      if (
        o.type === "line" ||
        o.type === "arrow" ||
        o.type === "circle" ||
        o.type === "zone"
      ) {
        const points = o.points.map((point) =>
          normToSvg(point.x, point.y, orientation),
        );
        if (points.length < 2) return "";
        const first = points[0]!;
        const last = points.at(-1)!;
        if (o.type === "zone") {
          const x = Math.min(first.x, last.x);
          const y = Math.min(first.y, last.y);
          return `<rect x="${x}" y="${y}" width="${Math.abs(last.x - first.x)}" height="${Math.abs(last.y - first.y)}" fill="${zoneFillColor(o.color)}" stroke="${zoneStrokeColor(o.color)}" stroke-width="3"/>`;
        }
        if (o.type === "circle") {
          return `<ellipse cx="${(first.x + last.x) / 2}" cy="${(first.y + last.y) / 2}" rx="${Math.abs(last.x - first.x) / 2}" ry="${Math.abs(last.y - first.y) / 2}" fill="none" stroke="${o.color}" stroke-width="3"/>`;
        }
        const path = points
          .map((point, index) =>
            `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
          )
          .join(" ");
        return `<path d="${path}" fill="none" stroke="${o.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return "";
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="1050" height="680"><rect width="100%" height="100%" fill="#177a38"/>${tokens}</svg>`;
}

/**
 * Open a multi-page print window — one page per step (Save as PDF).
 * Extension point for future video export.
 */
export async function exportTacticsStepsStoryboard(
  steps: Array<{ title: string; objects: TacticsBoardObject[] }>,
  opts: {
    boardTitle: string;
    orientation: TacticsFieldOrientation;
    fieldView: TacticsFieldView;
  },
): Promise<void> {
  if (steps.length === 0) throw new Error("No steps to export.");
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to export PDF.");
  }
  const pages = steps
    .map((step, i) => {
      const svg = objectsToSimpleSvg(
        step.objects,
        opts.orientation,
        opts.fieldView,
      );
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return `<section class="page"><h2>Step ${i + 1}${step.title ? ` — ${step.title.replace(/</g, "")}` : ""}</h2><img src="${dataUrl}" alt="Step ${i + 1}" /></section>`;
    })
    .join("");
  win.document.write(`<!doctype html><html><head><title>${opts.boardTitle.replace(/</g, "")}</title>
<style>
  @page { margin: 10mm; size: landscape; }
  html, body { margin: 0; background: #111; color: #eee; font-family: system-ui; }
  h1 { font: 600 18px system-ui; text-align: center; margin: 12px; }
  h2 { font: 600 14px system-ui; margin: 8px 12px; }
  .page { break-after: page; page-break-after: always; padding: 8px; }
  .page:last-child { break-after: auto; }
  img { display: block; max-width: 100%; height: auto; margin: 0 auto; background: #0a0a0a; }
</style></head><body>
<h1>${opts.boardTitle.replace(/</g, "")}</h1>
${pages}
<script>setTimeout(function(){window.print();},400)</script>
</body></html>`);
  win.document.close();
}
