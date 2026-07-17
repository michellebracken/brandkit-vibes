import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MOODS,
  TEXTURE_COUNT,
  generateBoard,
  regenerateBoard,
  getMood,
  textureStyle,
  type Board,
  type MoodId,
} from "@/lib/brandboard";
import { analyzePalette, bestOn, contrast, wcagGrade } from "@/lib/a11y";
import {
  paletteAsCss,
  paletteAsTailwind,
  boardAsJson,
  boardAsStyleGuide,
  downloadText,
  downloadBoardPdf,
  downloadBoardPng,
} from "@/lib/exporters";
import {
  pairsForMood,
  loadFonts,
  typographyCss,
  typographyTailwind,
} from "@/lib/fonts";
import { boardToShare, decodeState, encodeState } from "@/lib/share";
import { extractPaletteFromImage, extractSeedFromImage } from "@/lib/image-palette";
import { boardAltText, boardShortAlt } from "@/lib/alt";
import { LockToggle } from "@/components/LockToggle";
import { getVoicesForMood, nextVoice, pickVoice } from "@/lib/voice";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Brandkit Vibes — Brand Kit Generator" },
      { name: "description", content: "Generate brand boards on your device: palettes, Google Font pairings, textures, editorial layouts and a website mock — export as CSS, PNG or PDF." },
      { property: "og:title", content: "Brandkit Vibes — Brand Kit Generator" },
      { property: "og:description", content: "Generate brand boards on your device: palettes, Google Font pairings, textures, editorial layouts and a website mock — export as CSS, PNG or PDF." },
      { property: "og:url", content: "https://your-domain.com/" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Brandkit Vibes — Brand Kit Generator" },
      { name: "twitter:description", content: "Generate brand boards on your device: palettes, Google Font pairings, textures, editorial layouts and a website mock — export as CSS, PNG or PDF." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.com/" }],
  }),
});

type LayoutId = "editorial" | "poster" | "swiss" | "zine" | "website";
type CbMode = "normal" | "deuter" | "prot" | "trit";

interface SavedBoard {
  id: string;
  createdAt: number;
  board: Board;
  layout: LayoutId;
  locks?: {
    colors: boolean[];
    heading: boolean;
    body: boolean;
    textures: boolean[];
    voice: boolean;
  };
}

const STORAGE_KEY = "brandboard-studio-saved-v1";
const LEGACY_STORAGE_KEY = "moodboard-studio-saved-v1";
const MAX_SAVED = 24;
const MAX_HISTORY = 12;
const INITIAL_BOARD: Board = {
  moodId: "editorial",
  seed: "#1A1A1A",
  palette: ["#121212", "#2D2D2D", "#777777", "#D7D7D7", "#F4F4F4"],
  pair: { heading: "Playfair Display", body: "Inter" },
  textures: ["grain", "linen", "dots", "grid"],
  variantIndex: 0,
  voice: "Composed in the margins.",
};

type ExtractCount = 1 | 3 | 5;

interface HistoryEntry {
  id: string;
  at: number;
  board: Board;
  layout: LayoutId;
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const DEFAULT_TEXTURE_LOCKS = Array.from({ length: TEXTURE_COUNT }, () => false);
const emptyTextureLocks = () => Array.from({ length: TEXTURE_COUNT }, () => false);

function normalizeTextureLocks(value: unknown): boolean[] {
  if (Array.isArray(value)) {
    return Array.from({ length: TEXTURE_COUNT }, (_, i) => Boolean(value[i]));
  }
  if (typeof value === "boolean") {
    return Array.from({ length: TEXTURE_COUNT }, () => value);
  }
  return emptyTextureLocks();
}

function ensureTextureCount(board: Board): Board {
  if (board.textures.length >= TEXTURE_COUNT) return board;
  return regenerateBoard(board, board.seed, board.variantIndex, {
    textures: true,
    textureLocks: board.textures.map(() => true),
  });
}

function Index() {
  const [moodId, setMoodId] = useState<MoodId>("editorial");
  const [seed, setSeed] = useState<string>("");
  const [variant, setVariant] = useState(0);
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [fadeKey, setFadeKey] = useState(0);
  const [layout, setLayout] = useState<LayoutId>("editorial");
  const [cb, setCb] = useState<CbMode>("normal");
  const [locks, setLocks] = useState<boolean[]>([false, false, false, false, false]);
  const [headingLocked, setHeadingLocked] = useState(false);
  const [bodyLocked, setBodyLocked] = useState(false);
  const [textureLocks, setTextureLocks] = useState<boolean[]>(emptyTextureLocks);
  const allTexturesLocked = textureLocks.every(Boolean);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const fontsLocked = headingLocked && bodyLocked;
  const setFontsLocked = (v: boolean) => {
    setHeadingLocked(v);
    setBodyLocked(v);
  };
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedBoard[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const initFromHash = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [extractCount, setExtractCount] = useState<ExtractCount>(5);
  const [extractAdvanced, setExtractAdvanced] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [printPreview, setPrintPreview] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const suppressHistory = useRef(false);
  const [typeFadeKey, setTypeFadeKey] = useState(0);
  const [pairIndex, setPairIndex] = useState(0);

  // Preload the current pair's fonts whenever it changes so the
  // rendered board (and any subsequent export) uses the real faces.
  useEffect(() => {
    loadFonts([board.pair.heading, board.pair.body]);
    setTypeFadeKey((k) => k + 1);
  }, [board.pair.heading, board.pair.body]);

  // Track every board change into a bounded history buffer so users can
  // step backward/forward through recent iterations.
  useEffect(() => {
    if (suppressHistory.current) {
      suppressHistory.current = false;
      return;
    }
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIdx + 1);
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        at: Date.now(),
        board,
        layout,
      };
      const next = [...trimmed, entry].slice(-MAX_HISTORY);
      setHistoryIdx(next.length - 1);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, layout]);

  // Hydrate: read hash and localStorage
  useEffect(() => {
    setHydrated(true);
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // One-time migration from the older "moodboard-studio-saved-v1" key
        // so previously-saved boards survive the rename.
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          localStorage.setItem(STORAGE_KEY, legacy);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          raw = legacy;
        }
      }
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
    if (typeof window !== "undefined" && window.location.hash.startsWith("#b=")) {
      const s = decodeState(window.location.hash.slice(3));
      if (s) {
        initFromHash.current = true;
        setMoodId(s.moodId);
        setSeed(s.seed);
        setLayout((s.layout as LayoutId) ?? "editorial");
        setVariant(s.variantIndex);
        setBoard(ensureTextureCount({
          moodId: s.moodId,
          seed: s.seed,
          palette: s.palette,
          pair: s.pair,
          textures: s.textures,
          variantIndex: s.variantIndex,
        }));
        if (s.locks && s.locks.length === 5) setLocks(s.locks);
        if (typeof s.fontsLocked === "boolean") setFontsLocked(s.fontsLocked);
        if (typeof s.headingLocked === "boolean") setHeadingLocked(s.headingLocked);
        if (typeof s.bodyLocked === "boolean") setBodyLocked(s.bodyLocked);
        if (Array.isArray(s.textureLocks)) {
          setTextureLocks(normalizeTextureLocks(s.textureLocks));
        } else if (typeof s.texturesLocked === "boolean") {
          setTextureLocks(normalizeTextureLocks(s.texturesLocked));
        }
        if (typeof s.voiceLocked === "boolean") setVoiceLocked(s.voiceLocked);
        if (s.cb === "normal" || s.cb === "deuter" || s.cb === "prot" || s.cb === "trit") {
          setCb(s.cb);
        }
        // Fold voice from the shared state onto the board itself so
        // exports and displays reflect the shared tagline.
        if (typeof s.voice === "string") {
          setBoard((b) => ({ ...ensureTextureCount(b), voice: s.voice }));
        }
      }
    }
  }, []);

  const persistSaved = (next: SavedBoard[]) => {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const flash = (msg: string) => {
    setCopiedLabel(msg);
    setTimeout(() => setCopiedLabel(null), 1500);
  };

  const bump = () => setFadeKey((k) => k + 1);

  const pickMood = (id: MoodId) => {
    setMoodId(id);
    setVariant(0);
    setLocks([false, false, false, false, false]);
    setFontsLocked(false);
    setTextureLocks(emptyTextureLocks());
    setVoiceLocked(false);
    setBoard(generateBoard(id, seed || null, 0));
    bump();
  };

  const onSeedChange = (v: string) => {
    setSeed(v);
    setBoard((prev) =>
      regenerateBoard(prev, v || null, variant, {
        colors: true,
        fonts: false,
        textures: false,
        lockedColors: locks,
        fontsLocked,
      }),
    );
    bump();
  };

  const regenAll = useCallback(() => {
    const next = variant + 1;
    setVariant(next);
    setBoard((prev) => {
      const regen = regenerateBoard(prev, seed || null, next, {
        colors: true,
        fonts: true,
        textures: true,
        voice: true,
        lockedColors: locks,
        fontsLocked,
        textureLocks,
        voiceLocked,
      });
      if (!fontsLocked) {
        const pool = pairsForMood(getMood(prev.moodId).pairs);
        regen.pair = pool[Math.floor(Math.random() * pool.length)];
      }
      regen.pair = {
        ...regen.pair,
        heading: headingLocked ? prev.pair.heading : regen.pair.heading,
        body: bodyLocked ? prev.pair.body : regen.pair.body,
      };
      return regen;
    });
    bump();
  }, [variant, seed, locks, fontsLocked, headingLocked, bodyLocked, textureLocks, voiceLocked]);

  const regenColors = useCallback(() => {
    const next = variant + 1;
    setVariant(next);
    setBoard((prev) =>
      regenerateBoard(prev, seed || null, next, {
        colors: true,
        lockedColors: locks,
      }),
    );
    bump();
  }, [variant, seed, locks]);

  // Font-only regen: pull a random pair from the full catalog (curated
  // + extras) so users get real variety, and don't animate the whole
  // board — only the typography section refreshes.
  const regenFonts = useCallback(() => {
    if (fontsLocked) return;
    const pool = pairsForMood(getMood(moodId).pairs);
    let idx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === pairIndex) idx = (idx + 1) % pool.length;
    setPairIndex(idx);
    setBoard((prev) => ({
      ...prev,
      pair: {
        ...pool[idx],
        heading: headingLocked ? prev.pair.heading : pool[idx].heading,
        body: bodyLocked ? prev.pair.body : pool[idx].body,
      },
    }));
  }, [moodId, pairIndex, fontsLocked, headingLocked, bodyLocked]);

  const regenTextures = useCallback(() => {
    if (allTexturesLocked) return;
    const next = variant + 1;
    setVariant(next);
    setBoard((prev) => regenerateBoard(prev, seed || null, next, { textures: true, textureLocks }));
    bump();
  }, [variant, seed, textureLocks, allTexturesLocked]);

  const regenVoice = useCallback(() => {
    if (voiceLocked) return;
    setBoard((prev) => ({
      ...prev,
      voice: nextVoice(prev.moodId, prev.voice ?? pickVoice(prev.moodId, prev.variantIndex), 1),
    }));
  }, [voiceLocked]);

  // Step through the current mood's font pairings without touching colors
  // or textures. Explicit picks bypass the fonts lock — the user asked
  // for this pair, they get it.
  const pairPool = useMemo(
    () => pairsForMood(getMood(moodId).pairs),
    [moodId],
  );
  const setPairByIndex = useCallback(
    (i: number) => {
      const idx = ((i % pairPool.length) + pairPool.length) % pairPool.length;
      setPairIndex(idx);
      setBoard((prev) => ({
        ...prev,
        pair: {
          ...pairPool[idx],
          heading: headingLocked ? prev.pair.heading : pairPool[idx].heading,
          body: bodyLocked ? prev.pair.body : pairPool[idx].body,
        },
      }));
    },
    [pairPool, headingLocked, bodyLocked],
  );
  const currentPairIndex = pairIndex % pairPool.length;
  const pairCount = pairPool.length;
  const prevPair = useCallback(
    () => setPairByIndex(currentPairIndex - 1),
    [setPairByIndex, currentPairIndex],
  );
  const nextPair = useCallback(
    () => setPairByIndex(currentPairIndex + 1),
    [setPairByIndex, currentPairIndex],
  );

  // Surprise: re-roll every UNLOCKED axis at once, keeping the user's
  // anchors (locked swatches, locked heading/body, locked textures) in
  // place. If nothing is locked, this is essentially a fresh board on
  // the current mood.
  const surprise = useCallback(() => {
    const next = variant + Math.max(1, Math.floor(Math.random() * 5));
    setVariant(next);
    setBoard((prev) => {
      const regen = regenerateBoard(prev, seed || null, next, {
        colors: true,
        fonts: true,
        textures: true,
        voice: true,
        lockedColors: locks,
        fontsLocked,
        textureLocks,
        voiceLocked,
      });
      if (!fontsLocked) {
        const pool = pairsForMood(getMood(prev.moodId).pairs);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        regen.pair = {
          heading: headingLocked ? prev.pair.heading : pick.heading,
          body: bodyLocked ? prev.pair.body : pick.body,
          headingWeight: pick.headingWeight,
          bodyWeight: pick.bodyWeight,
        };
      }
      return regen;
    });
    bump();
  }, [variant, seed, locks, fontsLocked, headingLocked, bodyLocked, textureLocks, voiceLocked]);

  const cycleLayout = useCallback(() => {
    setLayout((l) =>
      l === "editorial" ? "poster"
      : l === "poster" ? "swiss"
      : l === "swiss" ? "zine"
      : l === "zine" ? "website"
      : "editorial"
    );
    bump();
  }, []);

  const toggleLock = (i: number) =>
    setLocks((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  const toggleTextureLock = (i: number) =>
    setTextureLocks((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  const saveBoard = useCallback(() => {
    const entry: SavedBoard = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      board,
      layout,
      locks: {
        colors: locks,
        heading: headingLocked,
        body: bodyLocked,
        textures: textureLocks,
        voice: voiceLocked,
      },
    };
    const next = [entry, ...saved].slice(0, MAX_SAVED);
    persistSaved(next);
    flash("Saved");
  }, [board, layout, saved, locks, headingLocked, bodyLocked, textureLocks, voiceLocked]);

  const restoreSaved = (s: SavedBoard) => {
    setMoodId(s.board.moodId);
    setSeed(s.board.seed);
    setVariant(s.board.variantIndex);
    setBoard(ensureTextureCount(s.board));
    setLayout(s.layout);
    // Restore lock state when the saved board carries it; older saves
    // without locks fall back to fully unlocked so nothing accidentally
    // stays pinned.
    if (s.locks) {
      if (Array.isArray(s.locks.colors) && s.locks.colors.length === 5) {
        setLocks(s.locks.colors);
      }
      setHeadingLocked(!!s.locks.heading);
      setBodyLocked(!!s.locks.body);
      {
        const t = s.locks.textures as unknown;
        setTextureLocks(normalizeTextureLocks(t));
      }
      setVoiceLocked(!!s.locks.voice);
    } else {
      setLocks([false, false, false, false, false]);
      setHeadingLocked(false);
      setBodyLocked(false);
      setTextureLocks(emptyTextureLocks());
      setVoiceLocked(false);
    }
    setGalleryOpen(false);
    bump();
  };

  const deleteSaved = (id: string) => persistSaved(saved.filter((s) => s.id !== id));

  const shareLink = () => {
    const hash = encodeState(
      boardToShare(board, layout, {
        locks,
        fontsLocked,
        headingLocked,
        bodyLocked,
        textureLocks,
        voiceLocked,
        cb,
      }),
    );
    const url = `${window.location.origin}${window.location.pathname}#b=${hash}`;
    window.history.replaceState(null, "", `#b=${hash}`);
    navigator.clipboard.writeText(url);
    flash("Self-contained link copied");
  };

  const downloadPng = async () => {
    if (!boardRef.current) return;
    flash("Rendering PNG…");
    try {
      await downloadBoardPng(boardRef.current, board);
      flash("PNG downloaded");
    } catch (err) {
      console.error("PNG export failed", err);
      flash("PNG failed — try again");
    }
  };

  const downloadPdfFromElement = useCallback(async (el: HTMLElement) => {
    flash("Rendering PDF…");
    try {
      await downloadBoardPdf(el, board);
      flash("PDF ready");
    } catch (err) {
      console.error("PDF export failed", err);
      flash("PDF failed");
    }
  }, [board]);

  const downloadPdf = useCallback(async () => {
    if (!boardRef.current) return;
    await downloadPdfFromElement(boardRef.current);
  }, [downloadPdfFromElement]);

  const cycleCb = useCallback(() => {
    setCb((c) =>
      c === "normal" ? "deuter" : c === "deuter" ? "prot" : c === "prot" ? "trit" : "normal",
    );
  }, []);

  const openImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onImageChosen = async (file: File | null) => {
    if (!file) return;
    setImageBusy(true);
    try {
      if (extractCount === 1) {
        const hex = await extractSeedFromImage(file);
        onSeedChange(hex);
        flash(`Seed from image · ${hex.toUpperCase()}`);
      } else {
        const hexes = await extractPaletteFromImage(file, extractCount);
        applyExtractedPalette(hexes);
        flash(`${hexes.length} colors from image`);
      }
    } catch {
      flash("Couldn't read image");
    } finally {
      setImageBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Merge extracted colors into the existing 5-slot palette. Locked slots
  // stay put; empty slots (if fewer than 5 colors extracted) keep the
  // current tone so the board never collapses to blank swatches.
  const applyExtractedPalette = (extracted: string[]) => {
    const seedFromImg = extracted[Math.floor(extracted.length / 2)] ?? extracted[0];
    setSeed(seedFromImg);
    setBoard((prev) => {
      const nextPalette = prev.palette.map((existing, i) => {
        if (locks[i]) return existing;
        return extracted[i] ?? existing;
      });
      return { ...prev, seed: seedFromImg, palette: nextPalette };
    });
    bump();
  };

  // Window-level drag & drop — accept images anywhere on the page.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      const hasFile = Array.from(e.dataTransfer.items ?? []).some(
        (it) => it.kind === "file",
      );
      if (!hasFile) return;
      e.preventDefault();
      setDropActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropActive(false);
    };
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      setDropActive(false);
      if (!file.type.startsWith("image/")) {
        flash("Drop an image file");
        return;
      }
      onImageChosen(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractCount, locks]);

  const restoreHistory = useCallback((delta: number) => {
    setHistoryIdx((idx) => {
      const next = Math.max(0, Math.min(history.length - 1, idx + delta));
      if (next === idx) return idx;
      const entry = history[next];
      if (entry) {
        suppressHistory.current = true;
        setMoodId(entry.board.moodId);
        setSeed(entry.board.seed);
        setVariant(entry.board.variantIndex);
        setBoard(entry.board);
        setLayout(entry.layout);
        bump();
      }
      return next;
    });
  }, [history]);

  const jumpHistory = (i: number) => {
    const entry = history[i];
    if (!entry) return;
    suppressHistory.current = true;
    setHistoryIdx(i);
    setMoodId(entry.board.moodId);
    setSeed(entry.board.seed);
    setVariant(entry.board.variantIndex);
    setBoard(entry.board);
    setLayout(entry.layout);
    bump();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  const copy = async (text: string, label: string) => {
    await copyToClipboard(text);
    flash(`${label} copied`);
  };

  const copyPalette = useCallback(() => {
    void copy(board.palette.map((hex) => hex.toUpperCase()).join(", "), "Palette");
  }, [board.palette]);

  const copyColor = useCallback((hex: string) => {
    void copy(hex.toUpperCase(), hex.toUpperCase());
  }, []);

  const moveColor = useCallback((from: number, to: number) => {
    setBoard((prev) => ({ ...prev, palette: moveItem(prev.palette, from, to) }));
    setLocks((prev) => moveItem(prev, from, to));
    bump();
  }, []);

  const setPaletteColor = useCallback((index: number, hex: string) => {
    setBoard((prev) => {
      if (!prev.palette[index] || prev.palette[index].toUpperCase() === hex.toUpperCase()) return prev;
      const next = [...prev.palette];
      next[index] = hex;
      return { ...prev, palette: next };
    });
    bump();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") { e.preventDefault(); regenAll(); }
      else if (k === "c") { e.preventDefault(); regenColors(); }
      else if (k === "f") { e.preventDefault(); regenFonts(); }
      else if (k === "t") { e.preventDefault(); regenTextures(); }
      else if (e.shiftKey && k === "v") { e.preventDefault(); regenVoice(); }
      else if (k === "s") { e.preventDefault(); saveBoard(); }
      else if (k === "l") { e.preventDefault(); cycleLayout(); }
      else if (k === "p") { e.preventDefault(); downloadPdf(); }
      else if (k === "i") { e.preventDefault(); openImagePicker(); }
      else if (k === "v") { e.preventDefault(); cycleCb(); }
      else if (k === "g") { e.preventDefault(); setGalleryOpen((v) => !v); }
      else if (k === "k") { e.preventDefault(); shareLink(); }
      else if (k === "e") { e.preventDefault(); setExportOpen((v) => !v); }
      else if (k === " ") { e.preventDefault(); surprise(); }
      else if (k === "h") { e.preventDefault(); setHistoryOpen((v) => !v); }
      else if (k === "u") { e.preventDefault(); restoreHistory(-1); }
      else if (k === "y") { e.preventDefault(); restoreHistory(1); }
      else if (k === "w") { e.preventDefault(); setPrintPreview((v) => !v); }
      else if (k === "," || k === "<") { e.preventDefault(); prevPair(); }
      else if (k === "." || k === ">") { e.preventDefault(); nextPair(); }
      else if (k === "escape") {
        setShortcutsOpen(false);
        setGalleryOpen(false);
        setExportOpen(false);
        setHistoryOpen(false);
        setPrintPreview(false);
      }
      else if (k === "?" || (e.shiftKey && k === "/")) { e.preventDefault(); setShortcutsOpen((v) => !v); }
      else if (/^[1-6]$/.test(k)) {
        e.preventDefault();
        const idx = parseInt(k, 10) - 1;
        if (MOODS[idx]) pickMood(MOODS[idx].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [regenAll, regenColors, regenFonts, regenTextures, regenVoice, saveBoard, cycleLayout, downloadPdf, openImagePicker, cycleCb, surprise, restoreHistory, prevPair, nextPair]);

  const cbFilter =
    cb === "normal" ? undefined : `url(#cb-${cb})`;

  return (
    <div className="min-h-dvh bg-background text-foreground" style={{ fontFamily: "var(--font-ui)" }}>
      <CbFilters />
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <header className="flex items-baseline justify-between border-b border-border pb-6">
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Brandkit Vibes
            </p>
            <h1
              className="text-4xl leading-[0.95] tracking-tight md:text-6xl"
              style={{ fontFamily: "var(--font-editorial)", fontWeight: 400, fontStyle: "italic" }}
            >
              A field guide to <span style={{ fontStyle: "normal" }}>direction.</span>
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="hidden text-xs uppercase tracking-[0.25em] text-muted-foreground md:inline">
              Client-side · No AI
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-border px-1 py-0.5 text-[11px] text-muted-foreground">
                <button
                  onClick={() => restoreHistory(-1)}
                  disabled={historyIdx <= 0}
                  className="rounded-full px-2 py-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Undo last change"
                  title="Back"
                >
                  ←
                </button>
                <span className="min-w-[2.5rem] text-center font-mono tabular-nums text-[10px]">
                  {history.length === 0 ? "0 / 0" : `${historyIdx + 1} / ${history.length}`}
                </span>
                <button
                  onClick={() => restoreHistory(1)}
                  disabled={historyIdx >= history.length - 1}
                  className="rounded-full px-2 py-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Redo change"
                  title="Forward"
                >
                  →
                </button>
              </div>
              <button
                onClick={() => setShortcutsOpen(true)}
                className="hidden rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground md:inline-block"
                aria-label="Show keyboard shortcuts"
              >
                ? Shortcuts
              </button>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Pick a mood, drop in a reference image, and shape a full brand direction — colors,
            typography, textures, and a live layout preview. Lock what you love, re-roll the rest,
            then export tokens, PNG, or a print-ready PDF.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {MOODS.map((m, i) => {
              const active = m.id === moodId;
              return (
                <button
                  key={m.id}
                  onClick={() => pickMood(m.id)}
                  className={
                    "group rounded-full border px-4 py-2 text-sm transition-all " +
                    (active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-transparent text-foreground hover:border-foreground")
                  }
                >
                  <span className="mr-2 font-mono text-[10px] opacity-60">{i + 1}</span>
                  {m.name}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Seed
              </span>
              <label className="relative block h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-border">
                <input
                  type="color"
                  value={seed || getMood(moodId).defaultSeed}
                  onChange={(e) => onSeedChange(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Seed color"
                />
                <span
                  className="pointer-events-none block h-full w-full"
                  style={{ background: seed || getMood(moodId).defaultSeed }}
                />
              </label>
              <span className="font-mono text-xs text-muted-foreground">
                {(seed || getMood(moodId).defaultSeed).toUpperCase()}
              </span>
              {seed && (
                <button
                  onClick={() => onSeedChange("")}
                  className="text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  clear
                </button>
              )}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={openImagePicker}
                    disabled={imageBusy}
                    className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Extract colors from an image (I)"
                  >
                    {imageBusy ? "Reading…" : "▲ From image"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtractAdvanced((v) => !v)}
                    className="text-[10px] uppercase tracking-wider text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    aria-expanded={extractAdvanced}
                  >
                    {extractAdvanced ? "hide options" : "advanced"}
                  </button>
                </div>
                <span className="pl-1 text-[10px] italic text-muted-foreground">
                  …or drop an image anywhere on the page
                </span>
                {extractAdvanced && (
                  <label className="mt-1 flex items-center gap-1 pl-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Extract:</span>
                    <select
                      value={extractCount}
                      onChange={(e) => setExtractCount(Number(e.target.value) as ExtractCount)}
                      className="rounded-full border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground focus:outline-none"
                      aria-label="Number of colors to extract from image"
                      title="How many colors to pull from the image"
                    >
                      <option value={1}>1 · Seed only</option>
                      <option value={3}>3 colors</option>
                      <option value={5}>5 · Full palette</option>
                    </select>
                  </label>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onImageChosen(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={regenAll} className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground" title="Re-roll colors, fonts, and textures — locks are respected (R)">
                ↻ Regenerate all
              </button>
              <button
                onClick={regenColors}
                className="rounded-full border border-border px-3 py-2 text-xs hover:border-foreground"
                title="Generate new colors only — locked swatches are preserved (C)"
                aria-label="Generate new colors only"
              >
                ↻ Colors only
              </button>
              <div
                className="inline-flex items-center overflow-hidden rounded-full border border-border text-xs"
                role="group"
                aria-label="Typography pairing"
              >
                <button
                  onClick={prevPair}
                  className="grid h-8 w-8 place-items-center hover:bg-secondary"
                  aria-label="Previous font pairing"
                  title="Previous pairing (,)"
                >
                  ‹
                </button>
                <button
                  onClick={regenFonts}
                  className="border-x border-border px-3 py-1.5 hover:bg-secondary"
                  title="New fonts only (F)"
                  aria-label={`Pairing ${currentPairIndex + 1} of ${pairCount} — regenerate fonts only`}
                >
                  Fonts only <span className="font-mono text-[10px] text-muted-foreground">{currentPairIndex + 1}/{pairCount}</span>
                </button>
                <button
                  onClick={nextPair}
                  className="grid h-8 w-8 place-items-center hover:bg-secondary"
                  aria-label="Next font pairing"
                  title="Next pairing (.)"
                >
                  ›
                </button>
              </div>
              <button
                onClick={regenTextures}
                disabled={allTexturesLocked}
                className="rounded-full border border-border px-3 py-2 text-xs hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border"
                title={allTexturesLocked ? "All textures locked — unlock at least one to re-roll" : "Generate new textures only — locked tiles are preserved (T)"}
                aria-label="Generate new textures only"
              >
                ↻ Textures only
              </button>
              <div
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs"
                role="group"
                aria-label="Voice tagline"
              >
                <button
                  onClick={regenVoice}
                  disabled={voiceLocked}
                  className="rounded-full px-2 py-1 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  title={voiceLocked ? "Voice locked — unlock to step to a new tagline" : "New voice / tagline (Shift+V)"}
                  aria-label="Generate a new voice tagline"
                >
                  ↻ Voice only
                </button>
                <LockToggle
                  locked={voiceLocked}
                  onClick={() => setVoiceLocked((v) => !v)}
                  label={voiceLocked ? "Unlock voice" : "Lock voice"}
                  size="sm"
                />
              </div>
              <button onClick={surprise} className="rounded-full border border-border px-4 py-2 text-sm hover:border-foreground">
                ✦ Surprise me
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Layout</span>
              {(["editorial", "poster", "swiss", "zine", "website"] as LayoutId[]).map((l) => (
                <button
                  key={l}
                  onClick={() => { setLayout(l); bump(); }}
                  className={
                    "rounded-full border px-3 py-1 text-xs capitalize transition-all " +
                    (layout === l
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Vision</span>
              {([
                ["normal", "Normal"],
                ["deuter", "Deuter."],
                ["prot", "Protan."],
                ["trit", "Tritan."],
              ] as [CbMode, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setCb(id)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition-all " +
                    (cb === id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 scroll-mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Your brandboard — {getMood(moodId).name}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={saveBoard} className="rounded-full border border-border px-4 py-2 hover:border-foreground" title="Save (S)">
                ☆ Save
              </button>
              <button onClick={() => setGalleryOpen(true)} className="rounded-full border border-border px-4 py-2 hover:border-foreground">
                Saved ({saved.length})
              </button>
              <button onClick={() => setHistoryOpen(true)} className="rounded-full border border-border px-4 py-2 hover:border-foreground" title="Board history (H)">
                ◷ History ({history.length})
              </button>
              <button onClick={shareLink} className="rounded-full border border-border px-4 py-2 hover:border-foreground">
                ⤴ Share link
              </button>
              <button
                onClick={() => setPrintPreview(true)}
                className="rounded-full border border-border px-4 py-2 hover:border-foreground"
                title="Print preview (W)"
              >
                ▤ Print Preview
              </button>
              <button
                onClick={() => setExportOpen((v) => !v)}
                aria-expanded={exportOpen}
                className="rounded-full bg-foreground px-4 py-2 text-background hover:opacity-90"
                title="Export options (E)"
              >
                ↓ Export ▾
              </button>
            </div>
          </div>

          {exportOpen && (
            <div className="mb-4 space-y-3 rounded-md border border-border bg-secondary/40 p-4 text-xs">
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Download</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setExportOpen(false); void downloadPng(); }} className="rounded-full bg-foreground px-3 py-1.5 text-background hover:opacity-90">↓ PNG</button>
                  <button onClick={() => { setExportOpen(false); void downloadPdf(); }} className="rounded-full bg-foreground px-3 py-1.5 text-background hover:opacity-90" title="Print-ready PDF (P)">↓ PDF</button>
                  <button onClick={() => downloadText(`typography-${board.pair.heading.replace(/\s+/g, "-").toLowerCase()}.css`, typographyCss(board.pair))} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">Typography .css</button>
                  <button onClick={() => downloadText(`brandkit-vibes-${board.moodId}.txt`, boardAsStyleGuide(board))} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">Style guide (.txt)</button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Copy palette</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={copyPalette} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">Hex list</button>
                  <button onClick={() => copy(paletteAsCss(board.palette), "CSS")} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">CSS variables</button>
                  <button onClick={() => copy(paletteAsTailwind(board.palette), "Tailwind")} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">Tailwind @theme</button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Copy typography &amp; tokens</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => copy(typographyCss(board.pair), "Typography CSS")} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">Typography CSS</button>
                  <button onClick={() => copy(typographyTailwind(board.pair), "Typography Tailwind")} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">Typography @theme</button>
                  <button onClick={() => copy(boardAsJson(board), "JSON")} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">JSON tokens</button>
                  <button onClick={() => copy(boardAltText(board), "Alt text")} className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-foreground">Alt text</button>
                </div>
              </div>
            </div>
          )}

          {copiedLabel && (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 inline-block rounded-full bg-foreground px-3 py-1 text-[11px] uppercase tracking-widest text-background"
            >
              ✓ {copiedLabel}
            </div>
          )}

          <div
            key={fadeKey}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-500"
            style={{ filter: cbFilter }}
            role="img"
            aria-label={boardShortAlt(board)}
          >
            <BoardRender
              board={board}
              layout={layout}
              locks={locks}
              onToggleLock={toggleLock}
              fontsLocked={fontsLocked}
              onToggleFontsLock={() => setFontsLocked(!fontsLocked)}
              headingLocked={headingLocked}
              bodyLocked={bodyLocked}
              onToggleHeadingLock={() => setHeadingLocked((v) => !v)}
              onToggleBodyLock={() => setBodyLocked((v) => !v)}
              textureLocks={textureLocks}
              onToggleTextureLock={toggleTextureLock}
              innerRef={boardRef}
              pairIndex={currentPairIndex}
              pairCount={pairCount}
              onPrevPair={prevPair}
              onNextPair={nextPair}
              typeFadeKey={typeFadeKey}
              onCopyColor={copyColor}
              onMoveColor={moveColor}
              onSetColor={setPaletteColor}
            />
          </div>
          <p className="sr-only">{boardAltText(board)}</p>

          <A11yReadout board={board} />
        </section>

        <footer className="mt-24 flex items-center justify-between border-t border-border pt-6 text-xs text-muted-foreground">
          <span>Brandkit Vibes</span>
          <span>Palette · Type · Texture — no server, no accounts.</span>
        </footer>
      </div>

      {hydrated && galleryOpen && (
        <GalleryDrawer
          saved={saved}
          onClose={() => setGalleryOpen(false)}
          onRestore={restoreSaved}
          onDelete={deleteSaved}
        />
      )}
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
      {historyOpen && (
        <HistoryDrawer
          history={history}
          activeIdx={historyIdx}
          onClose={() => setHistoryOpen(false)}
          onJump={jumpHistory}
          onUndo={() => restoreHistory(-1)}
          onRedo={() => restoreHistory(1)}
        />
      )}
      {printPreview && (
        <PrintPreviewModal
          board={board}
          layout={layout}
          cbFilter={cbFilter}
          locks={locks}
          fontsLocked={fontsLocked}
          onClose={() => setPrintPreview(false)}
          onDownload={downloadPdfFromElement}
        />
      )}
      {dropActive && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-foreground/70 p-8 text-background"
          aria-hidden="true"
        >
          <div className="rounded-md border-2 border-dashed border-background/70 px-10 py-8 text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] opacity-70">Drop image</p>
            <p className="mt-3 text-2xl" style={{ fontFamily: "var(--font-editorial)" }}>
              Extract {extractCount === 1 ? "a seed color" : `${extractCount} colors`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Board renderer with layout switch
// ============================================================

function BoardRender(props: {
  board: Board;
  layout: LayoutId;
  locks: boolean[];
  onToggleLock: (i: number) => void;
  fontsLocked: boolean;
  onToggleFontsLock: () => void;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  onToggleHeadingLock?: () => void;
  onToggleBodyLock?: () => void;
  textureLocks?: boolean[];
  onToggleTextureLock?: (i: number) => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  pairIndex?: number;
  pairCount?: number;
  onPrevPair?: () => void;
  onNextPair?: () => void;
  typeFadeKey?: number;
  onCopyColor?: (hex: string) => void;
  onMoveColor?: (from: number, to: number) => void;
  onSetColor?: (index: number, hex: string) => void;
}) {
  if (props.layout === "poster") return <PosterLayout {...props} />;
  if (props.layout === "swiss") return <SwissLayout {...props} />;
  if (props.layout === "zine") return <ZineLayout {...props} />;
  if (props.layout === "website") return <WebsiteLayout {...props} />;
  return <EditorialLayout {...props} />;
}

const SAMPLE_LINES = [
  "Form follows feeling.",
  "A quiet system of colour.",
  "Composed in the margins.",
  "Ink, paper, patience.",
  "The long slow work.",
];

function useSampleLine(board: Board) {
  return useMemo(() => SAMPLE_LINES[board.variantIndex % SAMPLE_LINES.length], [board.variantIndex]);
}

// LockButton is a thin delegate to the shared LockToggle so every axis
// (colors, fonts, textures, voice) uses the same component.
function LockButton({
  locked,
  onClick,
  label,
  size = "md",
}: {
  locked: boolean;
  onClick: () => void;
  label: string;
  size?: "sm" | "md";
}) {
  return <LockToggle locked={locked} onClick={onClick} label={label} size={size} />;
}

function PaletteStrip({
  board,
  locks,
  onToggleLock,
  onCopyColor,
  onMoveColor,
  height = "h-40 md:h-56",
}: {
  board: Board;
  locks: boolean[];
  onToggleLock: (i: number) => void;
  onCopyColor?: (hex: string) => void;
  onMoveColor?: (from: number, to: number) => void;
  height?: string;
}) {
  return (
    <div className="grid grid-cols-5">
      {board.palette.map((hex, i) => {
        const c = hex.toUpperCase();
        const text = bestOn(hex);
        const ratio = contrast(hex, text);
        const grade = wcagGrade(ratio);
        const badgeTone =
          grade === "AAA"
            ? "bg-emerald-500/90 text-white"
            : grade === "AA"
            ? "bg-emerald-500/70 text-white"
            : grade === "AA Large"
            ? "bg-amber-500/80 text-white"
            : "bg-red-500/85 text-white";
        return (
          <div
            key={i}
            role={onCopyColor ? "button" : undefined}
            tabIndex={onCopyColor ? 0 : undefined}
            onClick={() => onCopyColor?.(hex)}
            onKeyDown={(event) => {
              if (!onCopyColor) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onCopyColor(hex);
              }
            }}
            title={onCopyColor ? `Copy ${c}` : undefined}
            className={`group relative flex ${height} flex-col justify-end p-3`}
            style={{ background: hex, color: text }}
          >
            <div className="absolute right-2 top-2 flex items-center gap-1.5">
              <span
                className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${badgeTone}`}
                title={`Contrast ${ratio.toFixed(2)}:1 vs ${text === "#ffffff" ? "white" : "black"} — WCAG ${grade}`}
              >
                {grade === "AA Large" ? "AA L" : grade}
              </span>
              <LockButton
                locked={locks[i]}
                onClick={() => onToggleLock(i)}
                label={locks[i] ? `Unlock tone ${i + 1}` : `Lock tone ${i + 1}`}
              />
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] opacity-70">
              Tone 0{i + 1}
            </span>
            <span className="font-mono text-xs opacity-70">{c}</span>
            <span className="mt-0.5 font-mono text-[10px] opacity-60">
              {ratio.toFixed(2)}:1
            </span>
            {onMoveColor && (
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoveColor(i, i - 1);
                  }}
                  disabled={i === 0}
                  className="grid h-6 w-6 place-items-center rounded-full border border-current bg-background/80 text-[11px] text-foreground disabled:opacity-30"
                  aria-label={`Move tone ${i + 1} left`}
                  title="Move left"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoveColor(i, i + 1);
                  }}
                  disabled={i === board.palette.length - 1}
                  className="grid h-6 w-6 place-items-center rounded-full border border-current bg-background/80 text-[11px] text-foreground disabled:opacity-30"
                  aria-label={`Move tone ${i + 1} right`}
                  title="Move right"
                >
                  →
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TypeBlock({
  board,
  locked,
  onToggleLock,
  headingLocked = false,
  bodyLocked = false,
  onToggleHeadingLock,
  onToggleBodyLock,
  pairIndex,
  pairCount,
  onPrev,
  onNext,
  fadeKey = 0,
}: {
  board: Board;
  locked: boolean;
  onToggleLock: () => void;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  onToggleHeadingLock?: () => void;
  onToggleBodyLock?: () => void;
  pairIndex: number;
  pairCount: number;
  onPrev: () => void;
  onNext: () => void;
  fadeKey?: number;
}) {
  const line = useSampleLine(board);
  return (
    <div className="relative p-8">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Typography <span className="ml-2 text-muted-foreground/60">·</span>{" "}
          <span className="font-mono normal-case tracking-normal text-muted-foreground/80">
            pairing {pairIndex + 1} of {pairCount}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center overflow-hidden rounded-full border border-border">
            <button
              onClick={onPrev}
              className="grid h-6 w-6 place-items-center text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Previous font pairing"
              title="Previous pairing (,)"
            >
              ‹
            </button>
            <span className="border-x border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {pairIndex + 1}/{pairCount}
            </span>
            <button
              onClick={onNext}
              className="grid h-6 w-6 place-items-center text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Next font pairing"
              title="Next pairing (.)"
            >
              ›
            </button>
          </div>
          <LockButton locked={locked} onClick={onToggleLock} label={locked ? "Unlock fonts" : "Lock fonts"} />
        </div>
      </div>
      <div
        key={fadeKey}
        className="motion-safe:animate-in motion-safe:fade-in duration-300"
      >
        {/* HEADING role — big, in its own face */}
        <div className="mt-6 border-l-2 border-foreground pl-4">
          <div className="flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-[0.32em] text-muted-foreground">
              Heading · Display
            </p>
            {onToggleHeadingLock && (
              <LockButton
                locked={headingLocked}
                onClick={onToggleHeadingLock}
                label={headingLocked ? "Unlock heading font" : "Lock heading font"}
              />
            )}
          </div>
          <p
            className="mt-1 text-3xl leading-none tracking-tight md:text-4xl"
            style={{
              fontFamily: `"${board.pair.heading}", serif`,
              fontWeight: board.pair.headingWeight ?? 600,
            }}
          >
            {board.pair.heading}
          </p>
        </div>
        <p
          className="mt-5 text-5xl leading-[1.02] tracking-tight md:text-6xl"
          style={{
            fontFamily: `"${board.pair.heading}", serif`,
            fontWeight: board.pair.headingWeight ?? 500,
          }}
        >
          {line}
        </p>

        {/* BODY role — quieter, differentiated by dotted rule + smaller scale */}
        <div className="mt-8 border-l border-dotted border-muted-foreground/60 pl-4">
          <div className="flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-[0.32em] text-muted-foreground">
              Body · Running copy
            </p>
            {onToggleBodyLock && (
              <LockButton
                locked={bodyLocked}
                onClick={onToggleBodyLock}
                label={bodyLocked ? "Unlock body font" : "Lock body font"}
              />
            )}
          </div>
          <p
            className="mt-1 text-lg leading-tight text-foreground"
            style={{
              fontFamily: `"${board.pair.body}", sans-serif`,
              fontWeight: board.pair.bodyWeight ?? 500,
            }}
          >
            {board.pair.body}
          </p>
        </div>
        <p
          className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground"
          style={{
            fontFamily: `"${board.pair.body}", sans-serif`,
            fontWeight: board.pair.bodyWeight ?? 400,
          }}
        >
          The quick brown fox jumps over the lazy dog. Set for editorial rhythm — considered, quiet,
          made to be read slowly on paper or screen alike.
        </p>
        {board.voice && (
          <p
            className="mt-6 max-w-md border-l border-border pl-4 text-sm italic text-muted-foreground"
            style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
          >
            <span className="mr-2 text-[9px] not-italic uppercase tracking-[0.3em]">Voice</span>
            "{board.voice}"
          </p>
        )}
      </div>
    </div>
  );
}

function TextureGrid({
  board,
  tints,
  layout,
  locks,
  onToggleLock,
}: {
  board: Board;
  tints: string[];
  layout: "row" | "col";
  locks?: boolean[];
  onToggleLock?: (i: number) => void;
}) {
  return (
    <div className={layout === "row" ? "grid grid-cols-2 gap-4 md:grid-cols-4" : "grid grid-cols-1 gap-4"}>
      {board.textures.map((t, i) => (
        <div
          key={t + i}
          className="relative h-24 overflow-hidden rounded-sm border border-border"
          style={textureStyle(t, tints[i] ?? board.palette[2])}
        >
          {onToggleLock && (
            <div className="absolute right-2 top-2 z-10">
              <LockToggle
                size="sm"
                locked={!!locks?.[i]}
                onClick={() => onToggleLock(i)}
                label={locks?.[i] ? `Unlock texture ${i + 1}` : `Lock texture ${i + 1}`}
              />
            </div>
          )}
          <span className="absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-foreground">
            {t}
          </span>
        </div>
      ))}
    </div>
  );
}

function BoardHeader({ board }: { board: Board }) {
  const mood = getMood(board.moodId);
  return (
    <div className="relative border-b border-border px-8 pb-5 pt-7" style={{ minHeight: "7.25rem" }}>
      <div style={{ width: "540px" }}>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Brandboard №{String(board.variantIndex + 1).padStart(2, "0")}
        </p>
        <p
          className="mt-2 whitespace-nowrap text-3xl leading-tight"
          style={{
            display: "block",
            fontFamily: "var(--font-editorial)",
            fontWeight: 500,
            width: "540px",
            overflow: "visible",
            whiteSpace: "nowrap",
            wordBreak: "keep-all",
          }}
        >
          {mood.name}
        </p>
      </div>
      <p
        className="absolute right-8 top-8 max-w-[14rem] text-right text-xs italic text-muted-foreground"
        style={{ whiteSpace: "normal" }}
      >
        {mood.descriptor}
      </p>
    </div>
  );
}

function BoardFooter({ board }: { board: Board }) {
  const mood = getMood(board.moodId);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/40 px-8 py-4 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
      <span>Seed {board.seed.toUpperCase()}</span>
      <span>Harmony · {mood.harmony}</span>
      <span>Brandkit Vibes</span>
    </div>
  );
}

function EditorialLayout({
  board,
  locks,
  onToggleLock,
  fontsLocked,
  onToggleFontsLock,
  headingLocked = false,
  bodyLocked = false,
  onToggleHeadingLock,
  onToggleBodyLock,
  textureLocks = DEFAULT_TEXTURE_LOCKS,
  onToggleTextureLock,
  innerRef,
  pairIndex = 0,
  pairCount = 1,
  onPrevPair,
  onNextPair,
  typeFadeKey = 0,
  onCopyColor,
  onMoveColor,
}: {
  board: Board;
  locks: boolean[];
  onToggleLock: (i: number) => void;
  fontsLocked: boolean;
  onToggleFontsLock: () => void;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  onToggleHeadingLock?: () => void;
  onToggleBodyLock?: () => void;
  textureLocks?: boolean[];
  onToggleTextureLock?: (i: number) => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  pairIndex?: number;
  pairCount?: number;
  onPrevPair?: () => void;
  onNextPair?: () => void;
  typeFadeKey?: number;
  onCopyColor?: (hex: string) => void;
  onMoveColor?: (from: number, to: number) => void;
  onSetColor?: (index: number, hex: string) => void;
}) {
  const tints = [board.palette[1], board.palette[2], board.palette[3], board.palette[4]];
  return (
    <div
      ref={innerRef}
      className="overflow-hidden rounded-sm border border-border bg-card"
      style={{ boxShadow: "0 30px 80px -30px rgba(20,15,10,0.18)" }}
    >
      <BoardHeader board={board} />
      <PaletteStrip board={board} locks={locks} onToggleLock={onToggleLock} onCopyColor={onCopyColor} onMoveColor={onMoveColor} />
      <div className="grid grid-cols-1 gap-0 border-t border-border md:grid-cols-[1.4fr_1fr]">
        <div className="border-b border-border md:border-b-0 md:border-r">
          <TypeBlock
            board={board}
            locked={fontsLocked}
            onToggleLock={onToggleFontsLock}
            headingLocked={headingLocked}
            bodyLocked={bodyLocked}
            onToggleHeadingLock={onToggleHeadingLock}
            onToggleBodyLock={onToggleBodyLock}
            pairIndex={pairIndex}
            pairCount={pairCount}
            onPrev={onPrevPair ?? (() => {})}
            onNext={onNextPair ?? (() => {})}
            fadeKey={typeFadeKey}
          />
        </div>
        <div className="p-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Textures</p>
          <div className="mt-6">
            <TextureGrid
              board={board}
              tints={tints}
              layout="col"
              locks={textureLocks}
              onToggleLock={onToggleTextureLock}
            />
          </div>
        </div>
      </div>
      <BoardFooter board={board} />
    </div>
  );
}

function PosterLayout({
  board,
  locks,
  onToggleLock,
  fontsLocked,
  onToggleFontsLock,
  innerRef,
  onCopyColor,
  onMoveColor,
  textureLocks = DEFAULT_TEXTURE_LOCKS,
  onToggleTextureLock,
  onSetColor,
}: {
  board: Board;
  locks: boolean[];
  onToggleLock: (i: number) => void;
  fontsLocked: boolean;
  onToggleFontsLock: () => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  pairIndex?: number;
  pairCount?: number;
  onPrevPair?: () => void;
  onNextPair?: () => void;
  onCopyColor?: (hex: string) => void;
  onMoveColor?: (from: number, to: number) => void;
  textureLocks?: boolean[];
  onToggleTextureLock?: (i: number) => void;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  onToggleHeadingLock?: () => void;
  onToggleBodyLock?: () => void;
  typeFadeKey?: number;
  onSetColor?: (index: number, hex: string) => void;
}) {
  const line = useSampleLine(board);
  const bg = board.palette[0];
  const fg = bestOn(bg);
  const tints = [board.palette[2], board.palette[3], board.palette[4], board.palette[1]];
  return (
    <div
      ref={innerRef}
      className="overflow-hidden rounded-sm border border-border"
      style={{ boxShadow: "0 30px 80px -30px rgba(20,15,10,0.18)" }}
    >
      <div className="relative px-10 pb-8 pt-16" style={{ background: bg, color: fg }}>
        <p className="text-[10px] uppercase tracking-[0.3em] opacity-70">
          Poster · {getMood(board.moodId).name}
        </p>
        <h2
          className="mt-6 text-6xl leading-[0.95] tracking-tight md:text-8xl"
          style={{
            fontFamily: `"${board.pair.heading}", serif`,
            fontWeight: board.pair.headingWeight ?? 600,
          }}
        >
          {line}
        </h2>
        <p
          className="mt-8 max-w-lg text-base leading-relaxed opacity-80"
          style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
        >
          A vertical composition — palette below, type on top, textures grounding the base.
        </p>
        {board.voice && (
          <p
            className="mt-4 text-sm italic opacity-80"
            style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
          >
            "{board.voice}"
          </p>
        )}
        <div className="absolute right-6 top-6">
          <LockButton locked={fontsLocked} onClick={onToggleFontsLock} label={fontsLocked ? "Unlock fonts" : "Lock fonts"} />
        </div>
      </div>
      <PaletteStrip board={board} locks={locks} onToggleLock={onToggleLock} onCopyColor={onCopyColor} onMoveColor={onMoveColor} height="h-28 md:h-36" />
      <div className="relative grid grid-cols-2 gap-0 border-t border-border bg-card md:grid-cols-4">
        {board.textures.map((t, i) => (
          <div
            key={t + i}
            className="relative h-40 border-r border-border last:border-r-0"
            style={textureStyle(t, tints[i] ?? board.palette[2])}
          >
            {onToggleTextureLock && (
              <div className="absolute right-2 top-2 z-10">
                <LockToggle
                  size="sm"
                  locked={!!textureLocks[i]}
                  onClick={() => onToggleTextureLock(i)}
                  label={textureLocks[i] ? `Unlock texture ${i + 1}` : `Lock texture ${i + 1}`}
                />
              </div>
            )}
            <span className="absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-foreground">
              {t}
            </span>
          </div>
        ))}
      </div>
      <BoardFooter board={board} />
    </div>
  );
}

function SwissLayout({
  board,
  locks,
  onToggleLock,
  fontsLocked,
  onToggleFontsLock,
  innerRef,
  onCopyColor,
  onMoveColor,
  textureLocks = DEFAULT_TEXTURE_LOCKS,
  onToggleTextureLock,
  onSetColor,
}: {
  board: Board;
  locks: boolean[];
  onToggleLock: (i: number) => void;
  fontsLocked: boolean;
  onToggleFontsLock: () => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  onCopyColor?: (hex: string) => void;
  onMoveColor?: (from: number, to: number) => void;
  textureLocks?: boolean[];
  onToggleTextureLock?: (i: number) => void;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  onToggleHeadingLock?: () => void;
  onToggleBodyLock?: () => void;
  pairIndex?: number;
  pairCount?: number;
  onPrevPair?: () => void;
  onNextPair?: () => void;
  typeFadeKey?: number;
  onSetColor?: (index: number, hex: string) => void;
}) {
  const line = useSampleLine(board);
  return (
    <div
      ref={innerRef}
      className="overflow-hidden rounded-sm border border-border bg-card"
      style={{ boxShadow: "0 30px 80px -30px rgba(20,15,10,0.18)" }}
    >
      <BoardHeader board={board} />
      <div className="grid grid-cols-12 gap-px bg-border">
        {/* Row 1 */}
        <div className="col-span-8 bg-card p-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Display</p>
          <p
            className="mt-4 text-6xl leading-[0.95] tracking-tight md:text-7xl"
            style={{
              fontFamily: `"${board.pair.heading}", serif`,
              fontWeight: board.pair.headingWeight ?? 600,
            }}
          >
            {line}
          </p>
        </div>
        <div className="col-span-4 relative" style={{ background: board.palette[0] }}>
          <div className="absolute right-2 top-2">
            <LockButton locked={locks[0]} onClick={() => onToggleLock(0)} label={locks[0] ? "Unlock tone 1" : "Lock tone 1"} />
          </div>
          <span className="absolute bottom-3 left-3 font-mono text-[10px]" style={{ color: bestOn(board.palette[0]) }}>
            {board.palette[0].toUpperCase()}
          </span>
        </div>

        {/* Row 2 */}
        <div className="col-span-3 relative min-h-32" style={{ background: board.palette[1] }}>
          <div className="absolute right-2 top-2">
            <LockButton locked={locks[1]} onClick={() => onToggleLock(1)} label={locks[1] ? "Unlock tone 2" : "Lock tone 2"} />
          </div>
          <span className="absolute bottom-3 left-3 font-mono text-[10px]" style={{ color: bestOn(board.palette[1]) }}>
            {board.palette[1].toUpperCase()}
          </span>
        </div>
        <div className="col-span-6 bg-card p-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Body copy</p>
            <LockButton locked={fontsLocked} onClick={onToggleFontsLock} label={fontsLocked ? "Unlock fonts" : "Lock fonts"} />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground" style={{ fontFamily: `"${board.pair.body}", sans-serif` }}>
            Grid systems reward restraint. Every element earns its position — no drift, no ornament,
            just measured intervals of type, color and texture. {board.pair.heading} and {board.pair.body}
            do the reading.
          </p>
          {board.voice && (
            <p
              className="mt-3 text-xs italic text-muted-foreground"
              style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
            >
              "{board.voice}"
            </p>
          )}
        </div>
        <div className="col-span-3 relative min-h-32" style={{ background: board.palette[2] }}>
          <div className="absolute right-2 top-2">
            <LockButton locked={locks[2]} onClick={() => onToggleLock(2)} label={locks[2] ? "Unlock tone 3" : "Lock tone 3"} />
          </div>
          <span className="absolute bottom-3 left-3 font-mono text-[10px]" style={{ color: bestOn(board.palette[2]) }}>
            {board.palette[2].toUpperCase()}
          </span>
        </div>

        {/* Row 3 */}
        <div className="col-span-5 relative min-h-28" style={{ background: board.palette[3] }}>
          <div className="absolute right-2 top-2">
            <LockButton locked={locks[3]} onClick={() => onToggleLock(3)} label={locks[3] ? "Unlock tone 4" : "Lock tone 4"} />
          </div>
          <span className="absolute bottom-3 left-3 font-mono text-[10px]" style={{ color: bestOn(board.palette[3]) }}>
            {board.palette[3].toUpperCase()}
          </span>
        </div>
        <div className="col-span-4 relative" style={textureStyle(board.textures[0], board.palette[2])}>
          {onToggleTextureLock && (
            <div className="absolute right-2 top-2 z-10">
              <LockToggle
                size="sm"
                locked={!!textureLocks[0]}
                onClick={() => onToggleTextureLock(0)}
                label={textureLocks[0] ? "Unlock texture 1" : "Lock texture 1"}
              />
            </div>
          )}
          <span className="absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-foreground">
            {board.textures[0]}
          </span>
        </div>
        <div className="col-span-3 relative" style={{ background: board.palette[4] }}>
          <div className="absolute right-2 top-2">
            <LockButton locked={locks[4]} onClick={() => onToggleLock(4)} label={locks[4] ? "Unlock tone 5" : "Lock tone 5"} />
          </div>
          <span className="absolute bottom-3 left-3 font-mono text-[10px]" style={{ color: bestOn(board.palette[4]) }}>
            {board.palette[4].toUpperCase()}
          </span>
        </div>

        {/* Row 4 */}
        <div className="col-span-4 relative h-24" style={textureStyle(board.textures[1] ?? board.textures[0], board.palette[3])}>
          {onToggleTextureLock && (
            <div className="absolute right-2 top-2 z-10">
              <LockToggle
                size="sm"
                locked={!!textureLocks[1]}
                onClick={() => onToggleTextureLock(1)}
                label={textureLocks[1] ? "Unlock texture 2" : "Lock texture 2"}
              />
            </div>
          )}
          <span className="absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-foreground">
            {board.textures[1] ?? board.textures[0]}
          </span>
        </div>
        <div className="col-span-4 relative h-24" style={textureStyle(board.textures[2] ?? board.textures[0], board.palette[1])}>
          {onToggleTextureLock && (
            <div className="absolute right-2 top-2 z-10">
              <LockToggle
                size="sm"
                locked={!!textureLocks[2]}
                onClick={() => onToggleTextureLock(2)}
                label={textureLocks[2] ? "Unlock texture 3" : "Lock texture 3"}
              />
            </div>
          )}
          <span className="absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-foreground">
            {board.textures[2] ?? board.textures[0]}
          </span>
        </div>
        <div className="col-span-4 relative h-24" style={textureStyle(board.textures[3] ?? board.textures[0], board.palette[4])}>
          {onToggleTextureLock && (
            <div className="absolute right-2 top-2 z-10">
              <LockToggle
                size="sm"
                locked={!!textureLocks[3]}
                onClick={() => onToggleTextureLock(3)}
                label={textureLocks[3] ? "Unlock texture 4" : "Lock texture 4"}
              />
            </div>
          )}
          <span className="absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-foreground">
            {board.textures[3] ?? board.textures[0]}
          </span>
        </div>
      </div>
      <BoardFooter board={board} />
      <div className="border-t border-border">
        <PaletteStrip board={board} locks={locks} onToggleLock={onToggleLock} onCopyColor={onCopyColor} onMoveColor={onMoveColor} height="h-16 md:h-20" />
      </div>
    </div>
  );
}

// ============================================================
// A11y readout
// ============================================================

function A11yReadout({ board }: { board: Board }) {
  return <A11yReadoutInner board={board} />;
}

function ZineLayout({
  board,
  locks,
  onToggleLock,
  fontsLocked,
  onToggleFontsLock,
  innerRef,
  onCopyColor,
  onMoveColor,
  textureLocks = DEFAULT_TEXTURE_LOCKS,
  onToggleTextureLock,
  onSetColor,
}: {
  board: Board;
  locks: boolean[];
  onToggleLock: (i: number) => void;
  fontsLocked: boolean;
  onToggleFontsLock: () => void;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  onToggleHeadingLock?: () => void;
  onToggleBodyLock?: () => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  pairIndex?: number;
  pairCount?: number;
  onPrevPair?: () => void;
  onNextPair?: () => void;
  typeFadeKey?: number;
  onCopyColor?: (hex: string) => void;
  onMoveColor?: (from: number, to: number) => void;
  textureLocks?: boolean[];
  onToggleTextureLock?: (i: number) => void;
  onSetColor?: (index: number, hex: string) => void;
}) {
  const line = useSampleLine(board);
  const bg = board.palette[4];
  const accent = board.palette[1];
  const ink = bestOn(bg);
  return (
    <div
      ref={innerRef}
      className="overflow-hidden rounded-sm border border-border bg-card"
      style={{ boxShadow: "0 30px 80px -30px rgba(20,15,10,0.18)" }}
    >
      <BoardHeader board={board} />
      <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
        {/* Left "cover" page */}
        <div className="relative min-h-[26rem] p-10" style={{ background: bg, color: ink }}>
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-70">Zine · Cover</p>
          <h2
            className="mt-8 text-5xl leading-[0.95] tracking-tight md:text-6xl"
            style={{
              fontFamily: `"${board.pair.heading}", serif`,
              fontWeight: board.pair.headingWeight ?? 600,
            }}
          >
            {line}
          </h2>
          <div
            className="absolute bottom-8 left-10 right-10 border-t pt-4"
            style={{ borderColor: ink, opacity: 0.35 }}
          >
            <p
              className="text-xs uppercase tracking-[0.28em]"
              style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
            >
              {board.pair.heading} · {board.pair.body}
            </p>
            {board.voice && (
              <p
                className="mt-2 text-sm italic"
                style={{ fontFamily: `"${board.pair.body}", sans-serif`, opacity: 0.8 }}
              >
                "{board.voice}"
              </p>
            )}
          </div>
          <div className="absolute right-4 top-4">
            <LockButton locked={fontsLocked} onClick={onToggleFontsLock} label={fontsLocked ? "Unlock fonts" : "Lock fonts"} />
          </div>
        </div>
        {/* Right "spread" — two column article */}
        <div className="relative border-t border-border bg-card p-8 md:border-l md:border-t-0">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Spread · Two column</p>
          <div
            className="mt-4 columns-2 gap-6 text-[13px] leading-relaxed"
            style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
          >
            <p className="mb-3">
              <span
                className="mr-1 float-left text-5xl leading-none"
                style={{
                  fontFamily: `"${board.pair.heading}", serif`,
                  color: accent,
                  fontWeight: board.pair.headingWeight ?? 600,
                }}
              >
                {line.charAt(0)}
              </span>
              {line.slice(1)} A composed rhythm of colour, type and texture, laid out like a small
              printed pamphlet — enough room to breathe, close enough to feel bound.
            </p>
            <p className="mb-3">
              Grid, gutter, baseline. The zine layout leans into columns and pull-quotes — treat
              headings as anchors and body copy as the current between them.
            </p>
            <p>
              Pair {board.pair.heading} for display with {board.pair.body} for reading; the two
              carry the whole spread.
            </p>
          </div>
        </div>
      </div>
      <PaletteStrip board={board} locks={locks} onToggleLock={onToggleLock} onCopyColor={onCopyColor} onMoveColor={onMoveColor} height="h-24 md:h-28" />
      <div className="relative grid grid-cols-2 gap-0 border-t border-border bg-card md:grid-cols-4">
        {board.textures.map((t, i) => (
          <div
            key={t + i}
            className="relative h-28 border-r border-border last:border-r-0"
            style={textureStyle(t, board.palette[(i + 2) % board.palette.length])}
          >
            {onToggleTextureLock && (
              <div className="absolute right-2 top-2 z-10">
                <LockToggle
                  size="sm"
                  locked={!!textureLocks[i]}
                  onClick={() => onToggleTextureLock(i)}
                  label={textureLocks[i] ? `Unlock texture ${i + 1}` : `Lock texture ${i + 1}`}
                />
              </div>
            )}
            <span className="absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-foreground">
              {t}
            </span>
          </div>
        ))}
      </div>
      <BoardFooter board={board} />
    </div>
  );
}

function A11yReadoutInner({ board }: { board: Board }) {
  const analysis = useMemo(() => analyzePalette(board.palette), [board.palette]);
  return (
    <div className="mt-6 rounded-sm border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Accessibility · WCAG contrast
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">{analysis.passingAA}</span> of {analysis.total} tones
          reach AA for body text.
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {analysis.perColor.map((p, i) => {
          const grade = wcagGrade(Math.max(p.vsWhite, p.vsBlack));
          const color = grade === "Fail" ? "text-destructive" : grade === "AA Large" ? "text-muted-foreground" : "text-foreground";
          return (
            <div key={i} className="rounded-sm border border-border p-3">
              <div className="h-8 w-full rounded-sm" style={{ background: p.hex }} />
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">{p.hex.toUpperCase()}</p>
              <div className="mt-2 flex items-baseline justify-between text-[10px]">
                <span className="uppercase tracking-widest text-muted-foreground">Best</span>
                <span className={`font-medium ${color}`}>{grade}</span>
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>▢ {p.vsWhite.toFixed(2)}</span>
                <span>■ {p.vsBlack.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Gallery drawer
// ============================================================

function GalleryDrawer({
  saved,
  onClose,
  onRestore,
  onDelete,
}: {
  saved: SavedBoard[];
  onClose: () => void;
  onRestore: (s: SavedBoard) => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Saved boards">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg tracking-tight" style={{ fontFamily: "var(--font-editorial)" }}>
            Saved boards
          </h2>
          <button onClick={onClose} className="rounded-full border border-border px-3 py-1 text-xs hover:border-foreground" aria-label="Close saved boards">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Stored locally on this device. Max {MAX_SAVED}.</p>
        {saved.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Nothing saved yet. Hit ☆ Save above.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {saved.map((s) => (
              <li key={s.id} className="group rounded-sm border border-border p-3">
                <div className="grid grid-cols-5 overflow-hidden rounded-sm">
                  {s.board.palette.map((hex, i) => (
                    <div key={i} className="h-12" style={{ background: hex }} />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="text-foreground">{getMood(s.board.moodId).name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {s.layout} · {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onRestore(s)} className="rounded-full border border-border px-3 py-1 hover:border-foreground">Load</button>
                    <button onClick={() => onDelete(s.id)} className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-destructive" aria-label="Delete">
                      🗑
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Shortcuts sheet
// ============================================================

function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Generate",
      rows: [
        ["R", "Regenerate all — colors, fonts, and textures (respects locks)"],
        ["C", "New colors only"],
        ["F", "New fonts only"],
        [", / .", "Step back / forward through this mood's font pairings"],
        ["T", "New textures only"],
        ["Shift+V", "New voice / tagline"],
        ["Space", "Surprise me — re-roll every unlocked axis"],
      ],
    },
    {
      title: "Compose",
      rows: [
        ["1 – 6", "Pick a mood preset"],
        ["L", "Cycle layout (Editorial → Poster → Swiss → Zine → Website)"],
        ["V", "Cycle vision filter (color-blind preview)"],
        ["I", "Import an image (uses the extract-count selector)"],
        ["Drop", "Drop an image anywhere on the page"],
      ],
    },
    {
      title: "Manage",
      rows: [
        ["S", "Save the current board"],
        ["G", "Toggle the saved-boards drawer"],
        ["H", "Toggle board history (recent iterations)"],
        ["U / Y", "Undo / redo through history"],
        ["W", "Toggle print preview (letter page)"],
        ["E", "Toggle the export menu"],
        ["K", "Copy a self-contained share link"],
        ["P", "Download a print-ready PDF"],
      ],
    },
    {
      title: "Interface",
      rows: [
        ["?", "Toggle this sheet"],
        ["Esc", "Close any open panel"],
      ],
    },
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-md border border-border bg-background p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg tracking-tight" style={{ fontFamily: "var(--font-editorial)" }}>
            Keyboard shortcuts
          </h2>
          <button onClick={onClose} className="rounded-full border border-border px-3 py-1 text-xs hover:border-foreground" aria-label="Close shortcuts">
            Esc
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Shortcuts ignore keystrokes while you're typing in an input.
        </p>
        <div className="mt-5 space-y-5">
          {groups.map((g) => (
            <section key={g.title}>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{g.title}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>
                      <kbd className="whitespace-nowrap rounded-sm border border-border bg-secondary px-2 py-0.5 font-mono text-xs">
                        {k}
                      </kbd>
                    </dt>
                    <dd className="text-muted-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Color-blind filter primitives (inline SVG)
// ============================================================

function HistoryDrawer({
  history,
  activeIdx,
  onClose,
  onJump,
  onUndo,
  onRedo,
}: {
  history: HistoryEntry[];
  activeIdx: number;
  onClose: () => void;
  onJump: (i: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canUndo = activeIdx > 0;
  const canRedo = activeIdx >= 0 && activeIdx < history.length - 1;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Board history">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-full max-w-sm overflow-y-auto border-r border-border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg tracking-tight" style={{ fontFamily: "var(--font-editorial)" }}>
            Board history
          </h2>
          <button onClick={onClose} className="rounded-full border border-border px-3 py-1 text-xs hover:border-foreground" aria-label="Close history">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The last {MAX_HISTORY} iterations from this session. Not persisted.
        </p>

        <div className="mt-4 flex gap-2 text-xs">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="flex-1 rounded-full border border-border px-3 py-1.5 hover:border-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Undo (U)
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="flex-1 rounded-full border border-border px-3 py-1.5 hover:border-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Redo (Y) →
          </button>
        </div>

        {history.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="mt-6 space-y-3">
            {history.slice().reverse().map((entry, revIdx) => {
              const i = history.length - 1 - revIdx;
              const active = i === activeIdx;
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => onJump(i)}
                    className={
                      "group w-full rounded-sm border p-2 text-left transition-all " +
                      (active
                        ? "border-foreground bg-secondary/60"
                        : "border-border hover:border-foreground")
                    }
                    aria-current={active ? "true" : undefined}
                    aria-label={`${active ? "Current — " : ""}${boardShortAlt(entry.board)}`}
                  >
                    <div className="grid grid-cols-5 overflow-hidden rounded-sm">
                      {entry.board.palette.map((hex, pi) => (
                        <div key={pi} className="h-8" style={{ background: hex }} />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span>
                        {getMood(entry.board.moodId).name} · {entry.layout}
                      </span>
                      <span>
                        {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function PrintPreviewModal({
  board,
  layout,
  cbFilter,
  locks,
  fontsLocked,
  onClose,
  onDownload,
}: {
  board: Board;
  layout: LayoutId;
  cbFilter: string | undefined;
  locks: boolean[];
  fontsLocked: boolean;
  onClose: () => void;
  onDownload: (el: HTMLElement) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const previewBoardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Print preview"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[816px] max-w-none">
        <div className="mb-3 flex items-center justify-between text-xs text-background/90">
          <span className="rounded-full bg-background/10 px-3 py-1 uppercase tracking-widest text-background/80 backdrop-blur">
            Print preview · US Letter · portrait
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (previewRef.current) onDownload(previewRef.current);
              }}
              className="rounded-full bg-background px-4 py-1.5 text-xs text-foreground hover:opacity-90"
            >
              ↓ Download PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-full border border-background/40 px-3 py-1.5 text-xs text-background hover:bg-background/10"
            >
              Close
            </button>
          </div>
        </div>

        {/* Simulated US Letter page — width fixed, height flows so the
            full board is visible instead of getting clipped. */}
        <div
          ref={previewRef}
          data-export-page="letter"
          className="mx-auto w-[816px] max-w-none overflow-visible bg-white text-[#111] shadow-2xl"
          style={{ boxSizing: "border-box", padding: "48px 48px 34px", minHeight: "1056px" }}
        >
          <div className="w-full" style={{ filter: cbFilter }}>
            <BoardRender
              board={board}
              layout={layout}
              locks={locks}
              onToggleLock={() => {}}
              fontsLocked={fontsLocked}
              onToggleFontsLock={() => {}}
              innerRef={previewBoardRef}
            />
            <p className="mt-6 border-t border-black/10 pt-3 text-center text-[10px] uppercase tracking-[0.25em] text-black/60">
              Brandkit Vibes · {getMood(board.moodId).name} · seed {board.seed.toUpperCase()} ·
              {" "}{board.pair.heading} / {board.pair.body}
            </p>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-background/70">
          {boardShortAlt(board)}
        </p>
      </div>
    </div>
  );
}

function CbFilters() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="cb-deuter" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
        </filter>
        <filter id="cb-prot" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
        </filter>
        <filter id="cb-trit" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
        </filter>
      </defs>
    </svg>
  );
}

function WebsiteLayout({
  board,
  locks,
  onToggleLock,
  fontsLocked,
  onToggleFontsLock,
  innerRef,
  onCopyColor,
  onMoveColor,
  textureLocks = DEFAULT_TEXTURE_LOCKS,
  onToggleTextureLock,
  onSetColor,
}: {
  board: Board;
  locks: boolean[];
  onToggleLock: (i: number) => void;
  fontsLocked: boolean;
  onToggleFontsLock: () => void;
  headingLocked?: boolean;
  bodyLocked?: boolean;
  onToggleHeadingLock?: () => void;
  onToggleBodyLock?: () => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  pairIndex?: number;
  pairCount?: number;
  onPrevPair?: () => void;
  onNextPair?: () => void;
  typeFadeKey?: number;
  onCopyColor?: (hex: string) => void;
  onMoveColor?: (from: number, to: number) => void;
  textureLocks?: boolean[];
  onToggleTextureLock?: (i: number) => void;
  onSetColor?: (index: number, hex: string) => void;
}) {
  const line = useSampleLine(board);
  const bg = board.palette[4];
  const surface = board.palette[3];
  const accent = board.palette[1];
  const ctaBg = board.palette[0];
  const ink = bestOn(bg);
  const ctaInk = bestOn(ctaBg);
  const [textureSurface, setTextureSurface] = useState<
    "none" | "hero" | "nav" | "features" | "all"
  >("none");
  const [textureIndex, setTextureIndex] = useState(0);
  const activeTexture = board.textures[textureIndex] ?? board.textures[0];
  const heroStyle =
    textureSurface === "hero" || textureSurface === "all"
      ? { ...textureStyle(activeTexture, bg), color: ink }
      : { background: bg, color: ink };
  const navStyle =
    textureSurface === "nav"
      ? {
          ...textureStyle(activeTexture, bg),
          color: ink,
          fontFamily: `"${board.pair.body}", sans-serif`,
        }
      : { background: bg, color: ink, fontFamily: `"${board.pair.body}", sans-serif` };
  const featuresStyle =
    textureSurface === "features" || textureSurface === "all"
      ? textureStyle(activeTexture, surface)
      : { background: surface };
  const surfaceOptions: Array<{ id: typeof textureSurface; label: string }> = [
    { id: "none", label: "None" },
    { id: "hero", label: "Hero" },
    { id: "nav", label: "Nav" },
    { id: "features", label: "Features" },
    { id: "all", label: "All" },
  ];
  return (
    <div
      ref={innerRef}
      className="overflow-hidden rounded-sm border border-border bg-card"
      style={{ boxShadow: "0 30px 80px -30px rgba(20,15,10,0.18)" }}
    >
      <BoardHeader board={board} />
      {/* Texture picker: drape one of the board textures over a surface */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Texture</span>
        <div className="flex flex-wrap gap-1">
          {surfaceOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setTextureSurface(o.id)}
              className={`rounded-full border px-2 py-0.5 ${
                textureSurface === o.id
                  ? "border-foreground text-foreground"
                  : "border-border hover:border-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="ml-2">Pattern</span>
        <div className="flex gap-1">
          {board.textures.map((t, i) => (
            <button
              key={`${t}-${i}`}
              type="button"
              onClick={() => setTextureIndex(i)}
              disabled={textureSurface === "none"}
              title={`Texture ${i + 1}: ${t}`}
              className={`h-6 w-6 rounded-sm border transition ${
                textureIndex === i
                  ? "border-foreground ring-1 ring-foreground"
                  : "border-border hover:border-foreground"
              } ${textureSurface === "none" ? "opacity-40" : ""}`}
              style={textureStyle(t, surface)}
              aria-label={`Use texture ${i + 1}`}
            />
          ))}
        </div>
      </div>
      {/* Faux browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 rounded-sm bg-background px-3 py-0.5 font-mono text-[10px] text-muted-foreground">
          brand.studio
        </span>
      </div>
      {/* Nav */}
      <div
        className="flex items-center justify-between px-8 py-4"
        style={navStyle}
      >
        <div
          className="text-lg tracking-tight"
          style={{ fontFamily: `"${board.pair.heading}", serif`, fontWeight: 600 }}
        >
          Brandmark
        </div>
        <div className="hidden gap-6 text-xs uppercase tracking-widest opacity-80 md:flex">
          <span>Work</span><span>Studio</span><span>Journal</span><span>Contact</span>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs"
          style={{ background: ctaBg, color: ctaInk }}
        >
          Start
        </span>
      </div>
      {/* Hero */}
      <div className="relative px-8 py-16" style={heroStyle}>
        <div className="absolute right-4 top-4">
          <LockButton locked={fontsLocked} onClick={onToggleFontsLock} label={fontsLocked ? "Unlock fonts" : "Lock fonts"} />
        </div>
        <p
          className="text-[10px] uppercase tracking-[0.3em] opacity-70"
          style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
        >
          Landing · Hero
        </p>
        <h2
          className="mt-4 max-w-2xl text-4xl leading-[1.02] tracking-tight md:text-6xl"
          style={{
            fontFamily: `"${board.pair.heading}", serif`,
            fontWeight: board.pair.headingWeight ?? 600,
          }}
        >
          {line}
        </h2>
        <p
          className="mt-5 max-w-lg text-sm leading-relaxed opacity-80"
          style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
        >
          A composed system of colour, type and texture — shipped as a working
          website mock so you can feel the brand in situ before writing a line
          of code.
        </p>
        {board.voice && (
          <p
            className="mt-4 text-sm italic opacity-80"
            style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
          >
            "{board.voice}"
          </p>
        )}
        <div className="mt-8 flex gap-3">
          <span
            className="rounded-full px-5 py-2 text-sm"
            style={{ background: ctaBg, color: ctaInk, fontFamily: `"${board.pair.body}", sans-serif` }}
          >
            Get started →
          </span>
          <span
            className="rounded-full border px-5 py-2 text-sm"
            style={{ borderColor: ink, opacity: 0.7, fontFamily: `"${board.pair.body}", sans-serif` }}
          >
            View work
          </span>
        </div>
      </div>
      {/* Feature row */}
      <div className="grid grid-cols-1 gap-0 md:grid-cols-3" style={featuresStyle}>
        {["Considered", "Crafted", "Composed"].map((title, i) => (
          <div
            key={title}
            className="border-t border-black/10 p-6 md:border-l md:border-t-0 md:first:border-l-0"
            style={{ color: bestOn(surface) }}
          >
            <span
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: accent }}
            >
              0{i + 1}
            </span>
            <h3
              className="mt-2 text-lg tracking-tight"
              style={{ fontFamily: `"${board.pair.heading}", serif`, fontWeight: 600 }}
            >
              {title}
            </h3>
            <p
              className="mt-2 text-xs leading-relaxed opacity-80"
              style={{ fontFamily: `"${board.pair.body}", sans-serif` }}
            >
              Every element earns its place. Typography, palette and texture
              working in one direction.
            </p>
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-card p-6">
        <p className="mb-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Textures</p>
        <TextureGrid
          board={board}
          tints={[board.palette[1], board.palette[2], board.palette[3], board.palette[4]]}
          layout="row"
          locks={textureLocks}
          onToggleLock={onToggleTextureLock}
        />
      </div>
      {/* Always offer #FFFFFF as a swap-in option — most website designs
          want a clean white surface alongside the mood palette. Clicking a
          slot replaces that tone with pure white in the live board. */}
      <div className="border-t border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Swap in #FFFFFF
          </p>
          <button
            type="button"
            onClick={() => onCopyColor?.("#FFFFFF")}
            className="rounded-full border border-border px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:border-foreground hover:text-foreground"
            title="Copy #FFFFFF"
          >
            Copy hex
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {board.palette.map((hex, i) => {
            const isWhite = hex.toUpperCase() === "#FFFFFF";
            return (
              <button
                key={i}
                type="button"
                onClick={() => !isWhite && onSetColor?.(i, "#FFFFFF")}
                disabled={isWhite || !onSetColor}
                title={isWhite ? "Already white" : `Replace Tone 0${i + 1} with #FFFFFF`}
                className="flex items-center justify-between rounded-sm border border-border bg-background px-2 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
              >
                <span>Tone 0{i + 1}</span>
                <span
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ background: hex }}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Tip: use the arrows on the palette strip below to rearrange tones.
        </p>
      </div>
      <PaletteStrip board={board} locks={locks} onToggleLock={onToggleLock} onCopyColor={onCopyColor} onMoveColor={onMoveColor} height="h-24 md:h-28" />
      <BoardFooter board={board} />
    </div>
  );
}
