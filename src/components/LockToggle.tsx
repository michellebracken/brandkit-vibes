// Single lock-toggle component shared by every axis (colors, fonts,
// heading, body, textures, voice). Keeps sizing, glyph and
// aria-pressed behaviour consistent across the studio.
export function LockToggle({
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
  const dim = size === "sm" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-pressed={locked}
      title={label}
      className={
        "grid place-items-center rounded-full border transition-all " +
        dim +
        " " +
        (locked
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background/80 text-muted-foreground hover:text-foreground")
      }
    >
      {locked ? "🔒" : "🔓"}
    </button>
  );
}

export default LockToggle;