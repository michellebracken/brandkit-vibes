import chroma from "chroma-js";

export function contrast(a: string, b: string): number {
  return chroma.contrast(a, b);
}

export type WcagGrade = "AAA" | "AA" | "AA Large" | "Fail";

export function wcagGrade(ratio: number): WcagGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

export function bestOn(hex: string): "#ffffff" | "#111111" {
  return contrast(hex, "#ffffff") >= contrast(hex, "#111111") ? "#ffffff" : "#111111";
}

export interface PaletteA11y {
  perColor: {
    hex: string;
    vsWhite: number;
    vsBlack: number;
    bestText: "#ffffff" | "#111111";
    grade: WcagGrade;
  }[];
  passingAA: number;
  total: number;
}

export function analyzePalette(palette: string[]): PaletteA11y {
  const perColor = palette.map((hex) => {
    const vsWhite = contrast(hex, "#ffffff");
    const vsBlack = contrast(hex, "#111111");
    const best = Math.max(vsWhite, vsBlack);
    return {
      hex,
      vsWhite,
      vsBlack,
      bestText: (vsWhite >= vsBlack ? "#ffffff" : "#111111") as "#ffffff" | "#111111",
      grade: wcagGrade(best),
    };
  });
  const passingAA = perColor.filter((p) => wcagGrade(Math.max(p.vsWhite, p.vsBlack)) !== "Fail" && Math.max(p.vsWhite, p.vsBlack) >= 4.5).length;
  return { perColor, passingAA, total: palette.length };
}