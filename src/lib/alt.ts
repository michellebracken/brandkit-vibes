import type { Board } from "./brandboard";
import { getMood } from "./brandboard";

// Long-form descriptive alt text — suitable for a screen reader or as
// a caption when the board is shared/exported.
export function boardAltText(board: Board): string {
  const mood = getMood(board.moodId);
  const paletteList = board.palette.map((c) => c.toUpperCase()).join(", ");
  const textureList = board.textures.join(", ");
  return (
    `Brandboard in the ${mood.name} direction — ${mood.descriptor} ` +
    `Palette of ${board.palette.length} tones: ${paletteList}. ` +
    `Typography pairs ${board.pair.heading} for display with ${board.pair.body} for body copy. ` +
    `Textures: ${textureList}. ` +
    (board.voice ? `Voice tagline: "${board.voice}". ` : "") +
    `Built from seed color ${board.seed.toUpperCase()} using ${mood.harmony} harmony.`
  );
}

// Shorter caption — good for aria-label on the board container and
// for a visual caption under the print preview.
export function boardShortAlt(board: Board): string {
  const mood = getMood(board.moodId);
  return `${mood.name} brandboard: ${board.palette
    .map((c) => c.toUpperCase())
    .join(" · ")} — ${board.pair.heading} / ${board.pair.body}.`;
}