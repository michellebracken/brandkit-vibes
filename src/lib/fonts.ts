import type { FontPair } from "./brandboard";

// A broad catalog of Google Font pairings that any mood can browse
// through. Curated per-mood pairs (in `mood.pairs`) come first; these
// EXTRA_PAIRS are appended so users can step through 30+ options
// without touching colors or textures.
export const EXTRA_PAIRS: FontPair[] = [
  // Editorial serif + clean sans
  { heading: "Fraunces", body: "Inter" },
  { heading: "Playfair Display", body: "Inter" },
  { heading: "Cormorant Garamond", body: "Karla" },
  { heading: "Lora", body: "Work Sans" },
  { heading: "DM Serif Display", body: "Inter" },
  { heading: "Bodoni Moda", body: "Karla" },
  { heading: "Instrument Serif", body: "Inter" },
  { heading: "EB Garamond", body: "Montserrat" },
  { heading: "Crimson Pro", body: "Source Sans 3" },
  { heading: "Merriweather", body: "Source Sans 3" },
  { heading: "Spectral", body: "Work Sans" },
  { heading: "Libre Caslon Text", body: "Nunito" },
  // Modern display sans
  { heading: "Archivo Black", body: "Space Grotesk" },
  { heading: "Syne", body: "Manrope" },
  { heading: "Bricolage Grotesque", body: "Inter" },
  { heading: "Unbounded", body: "Inter" },
  { heading: "Big Shoulders Display", body: "Space Grotesk" },
  { heading: "Anton", body: "Roboto" },
  { heading: "Oswald", body: "Lato" },
  { heading: "Bebas Neue", body: "Roboto" },
  { heading: "Barlow Condensed", body: "Barlow" },
  { heading: "Rubik", body: "Nunito" },
  // Tech / mono
  { heading: "Space Grotesk", body: "IBM Plex Mono" },
  { heading: "JetBrains Mono", body: "Inter" },
  { heading: "Space Mono", body: "Inter" },
  { heading: "IBM Plex Serif", body: "IBM Plex Sans" },
  // Playful swaps
  { heading: "Fraunces", body: "Space Grotesk" },
  { heading: "DM Sans", body: "DM Serif Display" },
  { heading: "Public Sans", body: "Playfair Display" },
  { heading: "Familjen Grotesk", body: "IBM Plex Serif" },
  { heading: "Fira Sans", body: "Lora" },
];

// Combined list a mood can browse. Curated first so keyboard
// nav opens on the mood's opinionated picks.
export function pairsForMood(curated: FontPair[]): FontPair[] {
  const seen = new Set<string>();
  const merged: FontPair[] = [];
  for (const p of [...curated, ...EXTRA_PAIRS]) {
    const key = `${p.heading}|${p.body}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(p);
  }
  return merged;
}

// ---------- dynamic loader ----------

const loaded = new Set<string>();

function fontUrl(family: string): string {
  const fam = family.trim().replace(/\s+/g, "+");
  // Broad weight range covers heading/body use; not every family has
  // every weight but Google silently degrades to the nearest match.
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@300;400;500;600;700&display=swap`;
}

export function loadFonts(families: string[]) {
  if (typeof document === "undefined") return;
  for (const f of families) {
    if (!f || loaded.has(f)) continue;
    loaded.add(f);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fontUrl(f);
    link.setAttribute("data-mb-font", f);
    document.head.appendChild(link);
  }
}

// Preload and await the two families in a pair. Used before PDF/PNG
// export so the render captures the real typography.
export async function ensurePairReady(pair: FontPair): Promise<void> {
  loadFonts([pair.heading, pair.body]);
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`600 48px "${pair.heading}"`),
      document.fonts.load(`400 16px "${pair.body}"`),
    ]);
    await document.fonts.ready;
  } catch {
    /* no-op — fall back to whatever's cached */
  }
}

export function typographyCss(pair: FontPair): string {
  const url = `https://fonts.googleapis.com/css2?family=${pair.heading
    .trim()
    .replace(/\s+/g, "+")}:wght@400;600;700&family=${pair.body
    .trim()
    .replace(/\s+/g, "+")}:wght@400;500&display=swap`;
  return `/* Typography — Brandkit Vibes */
@import url('${url}');

:root {
  --font-heading: "${pair.heading}", serif;
  --font-body: "${pair.body}", sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  font-weight: 600;
  letter-spacing: -0.01em;
}

body, p {
  font-family: var(--font-body);
  font-weight: 400;
  line-height: 1.55;
}
`;
}

export function typographyTailwind(pair: FontPair): string {
  return `@theme {
  --font-heading: "${pair.heading}", serif;
  --font-body: "${pair.body}", sans-serif;
}
`;
}