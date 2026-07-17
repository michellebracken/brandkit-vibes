import type { Board, MoodId, TextureId, FontPair } from "./brandboard";

export interface ShareState {
  moodId: MoodId;
  seed: string;
  palette: string[];
  pair: FontPair;
  textures: TextureId[];
  variantIndex: number;
  layout: string;
  locks?: boolean[];
  fontsLocked?: boolean;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  texturesLocked?: boolean;
  textureLocks?: boolean[];
  voice?: string;
  voiceLocked?: boolean;
  cb?: string;
}

export function encodeState(s: ShareState): string {
  const json = JSON.stringify(s);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeState(hash: string): ShareState | null {
  try {
    const json = decodeURIComponent(escape(atob(hash)));
    return JSON.parse(json) as ShareState;
  } catch {
    return null;
  }
}

export function boardToShare(
  board: Board,
  layout: string,
  extras?: {
    locks?: boolean[];
    fontsLocked?: boolean;
    headingLocked?: boolean;
    bodyLocked?: boolean;
    texturesLocked?: boolean;
    textureLocks?: boolean[];
    voiceLocked?: boolean;
    cb?: string;
  },
): ShareState {
  return {
    moodId: board.moodId,
    seed: board.seed,
    palette: board.palette,
    pair: board.pair,
    textures: board.textures,
    variantIndex: board.variantIndex,
    layout,
    locks: extras?.locks,
    fontsLocked: extras?.fontsLocked,
    headingLocked: extras?.headingLocked,
    bodyLocked: extras?.bodyLocked,
    texturesLocked: extras?.texturesLocked,
    textureLocks: extras?.textureLocks,
    voice: board.voice,
    voiceLocked: extras?.voiceLocked,
    cb: extras?.cb,
  };
}