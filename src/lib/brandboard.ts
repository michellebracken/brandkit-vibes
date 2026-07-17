import chroma from "chroma-js";
import type { CSSProperties } from "react";
import { pickVoice } from "./voice";

export type MoodId =
  | "coastal"
  | "maximalist"
  | "earthy"
  | "tech"
  | "romantic"
  | "editorial"
  | "luxury"
  | "pop"
  | "retro"
  | "industrial"
  | "organic"
  | "cyberpunk"
  | "artisanal"
  | "corporate";

export interface FontPair {
  heading: string;
  body: string;
  headingWeight?: number;
  bodyWeight?: number;
}

export interface Mood {
  id: MoodId;
  name: string;
  descriptor: string;
  defaultSeed: string;
  harmony: "analogous" | "complementary" | "triadic" | "mono" | "split";
  satRange: [number, number];
  lightRange: [number, number];
  pairs: FontPair[];
  textures: TextureId[];
}

export type TextureId = "grain" | "dots" | "linen" | "mesh" | "grid" | "risograph";

export const TEXTURE_COUNT = 4;
const ALL_TEXTURES: TextureId[] = ["grain", "dots", "linen", "mesh", "grid", "risograph"];

export const MOODS: Mood[] = [
  {
    id: "coastal",
    name: "Coastal Minimal",
    descriptor: "Airy, weathered, sunlit.",
    defaultSeed: "#7BA7BC",
    harmony: "analogous",
    satRange: [0.15, 0.4],
    lightRange: [0.55, 0.92],
    pairs: [
      { heading: "Fraunces", body: "Inter" },
      { heading: "Cormorant Garamond", body: "Karla" },
      { heading: "Lora", body: "Work Sans" },
    ],
    textures: ["linen", "mesh", "grain", "grid"],
  },
  {
    id: "maximalist",
    name: "Bold Maximalist",
    descriptor: "Loud, saturated, unafraid.",
    defaultSeed: "#E4572E",
    harmony: "complementary",
    satRange: [0.7, 0.95],
    lightRange: [0.35, 0.7],
    pairs: [
      { heading: "Archivo Black", body: "Space Grotesk" },
      { heading: "Syne", body: "Manrope" },
      { heading: "DM Serif Display", body: "Inter" },
    ],
    textures: ["risograph", "dots", "grain", "mesh"],
  },
  {
    id: "earthy",
    name: "Warm Earthy",
    descriptor: "Tactile, grounded, unhurried.",
    defaultSeed: "#B4633B",
    harmony: "triadic",
    satRange: [0.3, 0.55],
    lightRange: [0.3, 0.75],
    pairs: [
      { heading: "Fraunces", body: "Work Sans" },
      { heading: "Lora", body: "Karla" },
      { heading: "Cormorant Garamond", body: "Manrope" },
    ],
    textures: ["linen", "grain", "mesh", "dots"],
  },
  {
    id: "tech",
    name: "Tech Futurism",
    descriptor: "Precise, luminous, engineered.",
    defaultSeed: "#2B6CB0",
    harmony: "split",
    satRange: [0.5, 0.85],
    lightRange: [0.2, 0.7],
    pairs: [
      { heading: "Space Grotesk", body: "IBM Plex Mono" },
      { heading: "Syne", body: "JetBrains Mono" },
      { heading: "Manrope", body: "IBM Plex Mono" },
    ],
    textures: ["grid", "dots", "mesh", "grain"],
  },
  {
    id: "romantic",
    name: "Soft Romantic",
    descriptor: "Dusky, tender, slow.",
    defaultSeed: "#D8A7B1",
    harmony: "analogous",
    satRange: [0.2, 0.45],
    lightRange: [0.7, 0.94],
    pairs: [
      { heading: "Bodoni Moda", body: "Karla" },
      { heading: "Instrument Serif", body: "Inter" },
      { heading: "Cormorant Garamond", body: "Manrope" },
    ],
    textures: ["linen", "mesh", "grain", "dots"],
  },
  {
    id: "editorial",
    name: "Editorial Mono",
    descriptor: "Restrained, ink-black, considered.",
    defaultSeed: "#1A1A1A",
    harmony: "mono",
    satRange: [0.02, 0.15],
    lightRange: [0.08, 0.95],
    pairs: [
      { heading: "Playfair Display", body: "Inter" },
      { heading: "Bodoni Moda", body: "Work Sans" },
      { heading: "DM Serif Display", body: "Manrope" },
    ],
    textures: ["grain", "linen", "dots", "grid"],
  },
  {
    id: "luxury",
    name: "Dark Luxury",
    descriptor: "Opulent, hushed, after-hours.",
    defaultSeed: "#1B0E2B",
    harmony: "split",
    satRange: [0.35, 0.7],
    lightRange: [0.08, 0.55],
    pairs: [
      { heading: "Bodoni Moda", body: "Inter" },
      { heading: "Playfair Display", body: "Manrope" },
      { heading: "Cormorant Garamond", body: "Karla" },
    ],
    textures: ["grain", "linen", "mesh", "dots"],
  },
  {
    id: "pop",
    name: "Playful Pop",
    descriptor: "Bright, bouncy, unserious.",
    defaultSeed: "#F2C230",
    harmony: "triadic",
    satRange: [0.75, 0.95],
    lightRange: [0.55, 0.82],
    pairs: [
      { heading: "Syne", body: "Manrope" },
      { heading: "DM Serif Display", body: "Space Grotesk" },
      { heading: "Archivo Black", body: "Karla" },
    ],
    textures: ["dots", "risograph", "grain", "mesh"],
  },
  {
    id: "retro",
    name: "Retro Nostalgia",
    descriptor: "Faded, sun-warmed, familiar.",
    defaultSeed: "#C97B3F",
    harmony: "analogous",
    satRange: [0.3, 0.55],
    lightRange: [0.4, 0.8],
    pairs: [
      { heading: "DM Serif Display", body: "Work Sans" },
      { heading: "Fraunces", body: "Karla" },
      { heading: "Lora", body: "Inter" },
    ],
    textures: ["grain", "risograph", "linen", "dots"],
  },
  {
    id: "industrial",
    name: "Industrial Raw",
    descriptor: "Concrete, honest, utilitarian.",
    defaultSeed: "#5A5A5A",
    harmony: "mono",
    satRange: [0.02, 0.2],
    lightRange: [0.15, 0.75],
    pairs: [
      { heading: "Space Grotesk", body: "IBM Plex Mono" },
      { heading: "Archivo Black", body: "JetBrains Mono" },
      { heading: "Manrope", body: "IBM Plex Mono" },
    ],
    textures: ["grid", "grain", "mesh", "dots"],
  },
  {
    id: "organic",
    name: "Organic Wellness",
    descriptor: "Calm, breathing, alive.",
    defaultSeed: "#8FA378",
    harmony: "analogous",
    satRange: [0.2, 0.45],
    lightRange: [0.5, 0.88],
    pairs: [
      { heading: "Fraunces", body: "Karla" },
      { heading: "Lora", body: "Work Sans" },
      { heading: "Cormorant Garamond", body: "Inter" },
    ],
    textures: ["linen", "grain", "mesh", "dots"],
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    descriptor: "Electric, after-dark, wired.",
    defaultSeed: "#FF2A9D",
    harmony: "split",
    satRange: [0.75, 0.98],
    lightRange: [0.12, 0.65],
    pairs: [
      { heading: "Space Grotesk", body: "JetBrains Mono" },
      { heading: "Syne", body: "IBM Plex Mono" },
      { heading: "Archivo Black", body: "JetBrains Mono" },
    ],
    textures: ["grid", "mesh", "dots", "grain"],
  },
  {
    id: "artisanal",
    name: "Artisanal Craft",
    descriptor: "Hand-touched, letterpress, slow.",
    defaultSeed: "#7A4A2B",
    harmony: "analogous",
    satRange: [0.25, 0.5],
    lightRange: [0.25, 0.85],
    pairs: [
      { heading: "Fraunces", body: "Karla" },
      { heading: "Lora", body: "Work Sans" },
      { heading: "DM Serif Display", body: "Manrope" },
    ],
    textures: ["grain", "linen", "risograph", "dots"],
  },
  {
    id: "corporate",
    name: "Corporate Trust",
    descriptor: "Clear, established, dependable.",
    defaultSeed: "#1F3A5F",
    harmony: "split",
    satRange: [0.2, 0.5],
    lightRange: [0.2, 0.88],
    pairs: [
      { heading: "Manrope", body: "Inter" },
      { heading: "Space Grotesk", body: "Work Sans" },
      { heading: "Playfair Display", body: "Inter" },
    ],
    textures: ["grid", "dots", "linen", "mesh"],
  },
];

export function getMood(id: MoodId): Mood {
  return MOODS.find((m) => m.id === id) ?? MOODS[0];
}

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function adjust(color: chroma.Color, mood: Mood): chroma.Color {
  const [h, s, l] = color.hsl();
  const targetS = clamp(
    (mood.satRange[0] + mood.satRange[1]) / 2 + (Math.random() - 0.5) * 0.2,
    mood.satRange[0],
    mood.satRange[1],
  );
  const targetL = clamp(
    mood.lightRange[0] + Math.random() * (mood.lightRange[1] - mood.lightRange[0]),
    0.05,
    0.97,
  );
  return chroma.hsl(isNaN(h) ? 0 : h, targetS, targetL);
}

export function generatePalette(seed: string, moodId: MoodId): string[] {
  const mood = getMood(moodId);
  const base = chroma.valid(seed) ? chroma(seed) : chroma(mood.defaultSeed);
  const [h] = base.hsl();
  const hue = isNaN(h) ? Math.random() * 360 : h;

  let hues: number[] = [];
  switch (mood.harmony) {
    case "analogous":
      hues = [hue - 30, hue - 15, hue, hue + 15, hue + 30];
      break;
    case "complementary":
      hues = [hue, hue + 15, hue + 180, hue + 195, hue - 10];
      break;
    case "triadic":
      hues = [hue, hue + 120, hue + 240, hue + 30, hue + 150];
      break;
    case "split":
      hues = [hue, hue + 150, hue + 210, hue + 30, hue - 30];
      break;
    case "mono":
      hues = [hue, hue, hue, hue, hue];
      break;
  }

  const colors = hues.map((hh) => {
    const c = chroma.hsl(((hh % 360) + 360) % 360, 0.5, 0.5);
    return adjust(c, mood);
  });

  // Ensure lightness spread for readability
  colors.sort((a, b) => a.hsl()[2] - b.hsl()[2]);
  return colors.map((c) => c.hex());
}

export function pickPair(mood: Mood, index: number): FontPair {
  return mood.pairs[index % mood.pairs.length];
}

export function pickTextures(mood: Mood, seed: number): TextureId[] {
  const arr = [...mood.textures, ...ALL_TEXTURES.filter((t) => !mood.textures.includes(t))];
  // rotate based on seed
  const rot = seed % arr.length;
  return [...arr.slice(rot), ...arr.slice(0, rot)].slice(0, TEXTURE_COUNT);
}

export function textureStyle(id: TextureId, tint: string): CSSProperties {
  const c = chroma(tint);
  const dark = c.luminance() > 0.5 ? c.darken(2).hex() : c.brighten(1.5).hex();
  switch (id) {
    case "grain":
      return {
        backgroundColor: tint,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      };
    case "dots":
      return {
        backgroundColor: tint,
        backgroundImage: `radial-gradient(${dark} 1.2px, transparent 1.4px)`,
        backgroundSize: "12px 12px",
      };
    case "linen":
      return {
        backgroundColor: tint,
        backgroundImage: `repeating-linear-gradient(45deg, ${dark}22 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, ${dark}22 0 1px, transparent 1px 4px)`,
      };
    case "mesh": {
      const a = c.set("hsl.h", "+40").hex();
      const b = c.set("hsl.h", "-40").hex();
      return {
        backgroundColor: tint,
        backgroundImage: `radial-gradient(at 20% 30%, ${a} 0px, transparent 55%), radial-gradient(at 80% 70%, ${b} 0px, transparent 50%), radial-gradient(at 50% 90%, ${dark} 0px, transparent 60%)`,
      };
    }
    case "grid":
      return {
        backgroundColor: tint,
        backgroundImage: `linear-gradient(${dark}33 1px, transparent 1px), linear-gradient(90deg, ${dark}33 1px, transparent 1px)`,
        backgroundSize: "18px 18px",
      };
    case "risograph": {
      const a = c.set("hsl.h", "+180").hex();
      return {
        backgroundColor: tint,
        backgroundImage: `radial-gradient(${a}66 2px, transparent 2px), radial-gradient(${dark}66 2px, transparent 2px)`,
        backgroundSize: "10px 10px, 10px 10px",
        backgroundPosition: "0 0, 5px 5px",
      };
    }
  }
}

export interface Board {
  moodId: MoodId;
  seed: string;
  palette: string[];
  pair: FontPair;
  textures: TextureId[];
  variantIndex: number;
  voice?: string;
}

export function generateBoard(
  moodId: MoodId,
  seed: string | null,
  variantIndex = 0,
): Board {
  const mood = getMood(moodId);
  const usedSeed = seed && chroma.valid(seed) ? seed : mood.defaultSeed;
  return {
    moodId,
    seed: usedSeed,
    palette: generatePalette(usedSeed, moodId),
    pair: pickPair(mood, variantIndex),
    textures: pickTextures(mood, variantIndex + 1),
    variantIndex,
    voice: pickVoice(moodId, variantIndex),
  };
}

export interface RegenOptions {
  colors?: boolean;
  fonts?: boolean;
  textures?: boolean;
  voice?: boolean;
  lockedColors?: boolean[]; // same length as palette; true = keep
  fontsLocked?: boolean;
  texturesLocked?: boolean; // legacy: treated as "all textures locked"
  textureLocks?: boolean[]; // per-slot locks; true = keep that slot
  voiceLocked?: boolean;
}

export function regenerateBoard(
  prev: Board,
  seed: string | null,
  variantIndex: number,
  opts: RegenOptions,
): Board {
  const mood = getMood(prev.moodId);
  const usedSeed = seed && chroma.valid(seed) ? seed : mood.defaultSeed;

  let palette = prev.palette;
  if (opts.colors) {
    const next = generatePalette(usedSeed, prev.moodId);
    const locks = opts.lockedColors ?? [];
    palette = next.map((c, i) => (locks[i] ? prev.palette[i] : c));
  }

  const pair = opts.fonts && !opts.fontsLocked ? pickPair(mood, variantIndex) : prev.pair;
  let textures = prev.textures;
  if (opts.textures && !opts.texturesLocked) {
    const next = pickTextures(mood, variantIndex + 1);
    const tlocks = opts.textureLocks ?? [];
    textures = next.map((t, i) => (tlocks[i] ? prev.textures[i] ?? t : t));
  }
  const voice =
    opts.voice && !opts.voiceLocked
      ? pickVoice(prev.moodId, variantIndex + Math.floor(Math.random() * 97))
      : prev.voice ?? pickVoice(prev.moodId, variantIndex);

  return {
    moodId: prev.moodId,
    seed: usedSeed,
    palette,
    pair,
    textures,
    variantIndex,
    voice,
  };
}