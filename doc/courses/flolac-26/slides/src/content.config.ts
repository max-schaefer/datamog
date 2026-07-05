import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// One Markdown file per slide, grouped into per-deck sub-folders of
// `src/content/slides` (`intro/`, `part1/`, ...). The numeric filename prefix
// (`01-`, `02-`, ...) fixes the running order within a folder; the deck route
// composes the shared `intro/` slides with one part's slides (see `decks.ts`).
const slides = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/slides" }),
  schema: z.object({
    title: z.string(),
    // `content`     - heading + body (the default)
    // `title`       - the opening title slide
    // `section`     - a section divider
    // `emphasis`    - a centred "big text" interstitial
    // `placeholder` - a slide whose body is not written yet
    kind: z
      .enum(["content", "title", "section", "emphasis", "placeholder"])
      .default("content"),
    // Short label for the running section shown in the footer.
    section: z.string().optional(),
    // Optional full-bleed background image (path under `/images`).
    image: z.string().optional(),
    // Alt text / regeneration prompt for the full-bleed `image`; rendered as the
    // aria-label of the background so the splash has a real accessible name.
    imageAlt: z.string().optional(),
    // Shrink body type for formula-/code-dense slides.
    tight: z.boolean().default(false),
    // End-of-part navigation slide: render the roadmap with the parts up to
    // this deck's part marked "done" and the next part "next up".
    roadmap: z.boolean().default(false),
  }),
});

export const collections = { slides };
