import type { Board } from "./brandboard";
import { getMood } from "./brandboard";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { ensurePairReady } from "./fonts";

function triggerBlobDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function waitForPaint() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (document.fonts?.ready) await document.fonts.ready;
}

async function elementToPng(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const targetWidth = Math.ceil(Math.max(el.scrollWidth, el.clientWidth, rect.width));
  const targetHeight = Math.ceil(Math.max(el.scrollHeight, el.clientHeight, rect.height));
  await waitForPaint();
  return toPng(el, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    // Skip inlining Google Fonts CSS — the browser has already loaded the
    // faces and their stylesheets are cross-origin, which throws
    // SecurityError during CSS-rule scraping and aborts the export.
    skipFonts: true,
    width: targetWidth,
    height: targetHeight,
  });
}

export async function downloadBoardPng(el: HTMLElement, board: Board) {
  await ensurePairReady(board.pair);
  const dataUrl = await elementToPng(el);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  triggerBlobDownload(`brandkit-vibes-${board.moodId}.png`, blob);
}

export function paletteAsCss(palette: string[]): string {
  return `:root {\n${palette.map((c, i) => `  --color-${i + 1}: ${c};`).join("\n")}\n}`;
}

export function paletteAsTailwind(palette: string[]): string {
  return `@theme {\n${palette.map((c, i) => `  --color-brand-${(i + 1) * 100}: ${c};`).join("\n")}\n}`;
}

export function boardAsJson(board: Board): string {
  const mood = getMood(board.moodId);
  return JSON.stringify(
    {
      mood: mood.name,
      seed: board.seed,
      palette: board.palette,
      typography: {
        heading: board.pair.heading,
        body: board.pair.body,
      },
      textures: board.textures,
      voice: board.voice ?? null,
    },
    null,
    2,
  );
}

export function boardAsStyleGuide(board: Board): string {
  const mood = getMood(board.moodId);
  const lines: string[] = [];
  lines.push(`BRANDBOARD — ${mood.name.toUpperCase()}`);
  lines.push(`${mood.descriptor}`);
  if (board.voice) {
    lines.push("");
    lines.push(`VOICE`);
    lines.push(`  "${board.voice}"`);
  }
  lines.push("");
  lines.push("PALETTE");
  board.palette.forEach((c, i) => lines.push(`  Tone 0${i + 1}   ${c.toUpperCase()}`));
  lines.push("");
  lines.push("TYPOGRAPHY");
  lines.push(`  Heading  ${board.pair.heading}`);
  lines.push(`  Body     ${board.pair.body}`);
  lines.push(`  Google Fonts: https://fonts.google.com/?query=${encodeURIComponent(board.pair.heading)}`);
  lines.push(`                https://fonts.google.com/?query=${encodeURIComponent(board.pair.body)}`);
  lines.push("");
  lines.push("TEXTURES");
  board.textures.forEach((t) => lines.push(`  · ${t}`));
  lines.push("");
  lines.push(`Seed color: ${board.seed.toUpperCase()}`);
  lines.push(`Generated with Brandkit Vibes`);
  return lines.join("\n");
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  triggerBlobDownload(filename, blob);
}

// Render the passed element to a print-ready single-page PDF, sized to
// letter and preserving the board's aspect ratio.
export async function downloadBoardPdf(el: HTMLElement, board: Board) {
  // Make sure the chosen typography is actually loaded and painted
  // before we snapshot the DOM, otherwise the PDF falls back to
  // system fonts.
  await ensurePairReady(board.pair);

  // Capture the print preview at its real fixed letter-page width so the
  // image is not narrowed by the modal and cropped on the right edge.
  const isLetterPage = el.dataset.exportPage === "letter";
  const dataUrl = await elementToPng(el);
  const img = await loadImage(dataUrl);

  const orientation: "l" | "p" = isLetterPage ? "p" : img.width > img.height ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const margin = 36;
  const footerBand = isLetterPage ? 0 : 48;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - footerBand;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (pageW - w) / 2;
  const y = isLetterPage ? (pageH - h) / 2 : margin;

  pdf.addImage(dataUrl, "PNG", x, y, w, h, undefined, "FAST");

  if (!isLetterPage) {
    const mood = getMood(board.moodId);
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(
      `Brandkit Vibes · ${mood.name} · seed ${board.seed.toUpperCase()} · ${board.pair.heading} / ${board.pair.body}${board.voice ? ` · "${board.voice}"` : ""}`,
      pageW / 2,
      pageH - margin / 1.5,
      { align: "center" },
    );
  }

  const pdfBlob = pdf.output("blob");
  triggerBlobDownload(`brandkit-vibes-${board.moodId}.pdf`, pdfBlob);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}