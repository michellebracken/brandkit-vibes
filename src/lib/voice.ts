import type { MoodId } from "./brandboard";

// Per-mood tagline catalog. Each entry is a short, standalone line — the
// voice/tagline axis in the studio. Kept purely client-side so the studio
// stays offline-friendly.
const VOICES: Record<MoodId, string[]> = {
  coastal: [
    "Salt, sun, patience.",
    "Weathered, and better for it.",
    "Room to breathe.",
    "Composed like driftwood.",
    "A quieter shoreline.",
    "Low tide, low ego.",
    "Sunlit, unhurried.",
    "Pale ink, open air.",
  ],
  maximalist: [
    "Loud, on purpose.",
    "Ornament is optional. We opted in.",
    "Bring receipts.",
    "Turn every dial up.",
    "No small talk.",
    "A brand with volume.",
    "Say it in color.",
    "Big feelings, bigger type.",
  ],
  earthy: [
    "Made by hand, on purpose.",
    "Slow work, warm work.",
    "Rooted, not stuck.",
    "Clay, oak, patience.",
    "The grain shows.",
    "Warm-blooded design.",
    "Built to weather.",
    "Softly, and for keeps.",
  ],
  tech: [
    "Engineered for clarity.",
    "Signal, not noise.",
    "Precision as posture.",
    "Built in blueprint blue.",
    "The system, in daylight.",
    "Sharp edges, clean logic.",
    "Ship the honest version.",
    "Made of measurements.",
  ],
  romantic: [
    "Softly, then all at once.",
    "Dusk-lit, hand-written.",
    "A little longer here.",
    "Slower than necessary.",
    "Dusty pinks and long letters.",
    "For the tender-hearted.",
    "Lingering, by design.",
    "The long, slow yes.",
  ],
  editorial: [
    "Composed in the margins.",
    "The long slow work.",
    "Ink, paper, patience.",
    "A quiet system of colour.",
    "Form follows feeling.",
    "Set for reading.",
    "Nothing extra, nothing missing.",
    "Considered, cover to cover.",
  ],
  luxury: [
    "After hours, on velvet.",
    "Quiet money, loud taste.",
    "Low light, high polish.",
    "Poured, not printed.",
    "Reserved for the room.",
    "Slow gold, slower nights.",
    "Kept, not chased.",
    "Discreet, and deliberate.",
  ],
  pop: [
    "Made to make you grin.",
    "Turn it up, keep it kind.",
    "Serious about being silly.",
    "A high five in typeface.",
    "Louder, sweeter, sooner.",
    "Bring snacks.",
    "Big yes energy.",
    "Small joys, boldly set.",
  ],
  retro: [
    "Warm as an old cassette.",
    "Sun-bleached and sincere.",
    "Nostalgia, freshly pressed.",
    "Softer than you remember.",
    "Familiar, in a good way.",
    "The long weekend look.",
    "Faded, on purpose.",
    "A slow rerun of good things.",
  ],
  industrial: [
    "Built plain, built right.",
    "Steel-toe typography.",
    "Nothing hidden, nothing spared.",
    "The honest ugly.",
    "Made in the daylight.",
    "Concrete and character.",
    "Utility, worn well.",
    "No apologies, no ornament.",
  ],
  organic: [
    "Room to grow.",
    "Green, and getting greener.",
    "Rooted, breathing, well.",
    "Slow food for the eyes.",
    "Made with more air.",
    "Kinder by design.",
    "A softer daily practice.",
    "Whole, and a little wild.",
  ],
  cyberpunk: [
    "Wired, and awake.",
    "Neon runs in the veins.",
    "After midnight, always on.",
    "Signal in the static.",
    "Chrome, glow, repeat.",
    "Built for the night shift.",
    "Loud in the dark.",
    "Ping me at 3 a.m.",
  ],
  artisanal: [
    "Small batch, big care.",
    "Slow hands, sharp eye.",
    "Pressed, not printed.",
    "One at a time, on purpose.",
    "Made close to home.",
    "The maker\u2019s mark stays.",
    "Honest work, warm result.",
    "Craft, kept in the shop.",
  ],
  corporate: [
    "Steady, and here to stay.",
    "Built on the boring stuff.",
    "Answers you can file.",
    "Trust, in plain type.",
    "The quiet, capable choice.",
    "Compounding, on schedule.",
    "Serious work, kindly done.",
    "Decades, not quarters.",
  ],
};

export function getVoicesForMood(moodId: MoodId): string[] {
  return VOICES[moodId] ?? VOICES.editorial;
}

export function pickVoice(moodId: MoodId, seed: number): string {
  const pool = getVoicesForMood(moodId);
  const i = ((seed % pool.length) + pool.length) % pool.length;
  return pool[i];
}

export function nextVoice(moodId: MoodId, current: string, direction: 1 | -1 = 1): string {
  const pool = getVoicesForMood(moodId);
  const idx = pool.indexOf(current);
  const next = idx < 0 ? 0 : (idx + direction + pool.length) % pool.length;
  return pool[next];
}