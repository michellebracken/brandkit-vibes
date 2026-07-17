import { createFileRoute, Link } from "@tanstack/react-router";

const URL = "https://your-domain.com/guides/brand-board-from-image";

export const Route = createFileRoute("/guides/brand-board-from-image")({
  head: () => ({
    meta: [
      { title: "How to Build a Brand Board From an Image — Brandkit Vibes" },
      {
        name: "description",
        content:
          "Step-by-step guide to turning any photo into a cohesive brand board: extract a palette, pair fonts, choose textures, and export.",
      },
      { property: "og:title", content: "How to Build a Brand Board From an Image" },
      {
        property: "og:description",
        content:
          "Turn a single photo into a full brand direction — palette, typography, textures — with Brandkit Vibes.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "Build a brand board from an image",
          description:
            "Extract colors from a reference image and turn them into a full brand board with typography, textures, and voice.",
          step: [
            { "@type": "HowToStep", name: "Pick a reference image", text: "Choose a photo whose mood matches the brand you want — lighting and saturation drive the palette." },
            { "@type": "HowToStep", name: "Extract a seed color", text: "Drop the image into Brandkit Vibes to pull a dominant hex color as your seed." },
            { "@type": "HowToStep", name: "Choose a mood", text: "Pick a mood (Coastal, Editorial, Cyberpunk, etc.) to shape harmony, saturation, and font pairings." },
            { "@type": "HowToStep", name: "Lock what works, regenerate the rest", text: "Lock any colors, fonts, or textures you like and regenerate individual slots until the board feels right." },
            { "@type": "HowToStep", name: "Export", text: "Download the board as PNG, PDF, or copy the CSS tokens straight into your project." },
          ],
        }),
      },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Guide</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">
        How to build a brand board from an image
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        A single reference photo carries enough signal to seed an entire brand direction.
        Here's the five-step flow we use in Brandkit Vibes.
      </p>

      <section className="mt-10 space-y-8">
        <Step n={1} title="Pick a reference image">
          Choose a photo whose mood matches the brand you're going for. Warm sunset shots
          push palettes earthy; neon night shots push them toward cyberpunk. Lighting and
          saturation in the source drive what gets extracted.
        </Step>
        <Step n={2} title="Extract a seed color">
          Drop the image into Brandkit Vibes. It samples the dominant hex value and uses
          it as the seed — every downstream color decision anchors here.
        </Step>
        <Step n={3} title="Choose a mood">
          Moods control harmony (analogous, complementary, triadic), saturation range, and
          which typographic pairings feel native. The same seed color reads completely
          differently under Editorial Mono vs. Playful Pop.
        </Step>
        <Step n={4} title="Lock what works, regenerate the rest">
          Click the lock on any color chip, font pair, or texture slot you want to keep,
          then regenerate. This is the fastest way to converge on a board that feels
          intentional instead of random.
        </Step>
        <Step n={5} title="Export">
          Download the board as PNG or PDF for stakeholder review, or copy the CSS
          variables directly into your project's design tokens.
        </Step>
      </section>

      <div className="mt-12 rounded-2xl border border-border p-6">
        <p className="text-sm text-muted-foreground">Ready to try it?</p>
        <Link
          to="/"
          className="mt-2 inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open Brandkit Vibes →
        </Link>
      </div>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">
        <span className="mr-2 text-muted-foreground">{n}.</span>
        {title}
      </h2>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </div>
  );
}