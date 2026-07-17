import chroma from "chroma-js";

// Sample down an uploaded image and pick the most vivid, mid-lightness
// color as a seed. The existing generatePalette() will bloom a full
// harmony palette from that seed.
export async function extractSeedFromImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = 96;
    const h = Math.max(1, Math.round((img.height / img.width) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas ctx");
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let bestScore = -Infinity;
    let bestHex = "#888888";
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 200) continue;
      const c = chroma(data[i], data[i + 1], data[i + 2]);
      const [, s, l] = c.hsl();
      if (isNaN(s) || l < 0.15 || l > 0.85) continue;
      // Favor saturated tones near mid-lightness
      const score = s * 2 - Math.abs(l - 0.5);
      if (score > bestScore) {
        bestScore = score;
        bestHex = c.hex();
      }
    }
    return bestHex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Extract N dominant colors from an image via a small k-means pass on
// downsampled pixels. Returns hex colors sorted from dark to light.
export async function extractPaletteFromImage(
  file: File,
  count: number,
): Promise<string[]> {
  const k = Math.max(1, Math.min(count, 6));
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = 120;
    const h = Math.max(1, Math.round((img.height / img.width) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas ctx");
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const samples: number[][] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
    if (samples.length === 0) return ["#888888"];

    // Seed centroids by evenly spaced samples for stable results.
    const centroids: number[][] = [];
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(((i + 0.5) / k) * samples.length);
      centroids.push([...samples[idx]]);
    }
    for (let iter = 0; iter < 10; iter++) {
      const sums = centroids.map(() => [0, 0, 0, 0]);
      for (const p of samples) {
        let bi = 0;
        let bd = Infinity;
        for (let i = 0; i < k; i++) {
          const c = centroids[i];
          const d =
            (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        sums[bi][0] += p[0];
        sums[bi][1] += p[1];
        sums[bi][2] += p[2];
        sums[bi][3]++;
      }
      for (let i = 0; i < k; i++) {
        if (sums[i][3]) {
          centroids[i] = [
            sums[i][0] / sums[i][3],
            sums[i][1] / sums[i][3],
            sums[i][2] / sums[i][3],
          ];
        }
      }
    }

    const hexes = centroids.map((c) => chroma(c[0], c[1], c[2]).hex());
    hexes.sort((a, b) => chroma(a).hsl()[2] - chroma(b).hsl()[2]);
    return hexes;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}