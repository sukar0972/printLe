# printLe visual language

Inspired by [Flow (shadcn Studio)](https://shadcnstudio.com/preview/templates/shadcn-astro-flow-landing-page). That template is a **paid SaaS marketing landing page**. printLe is a **signed-in print queue**. Steal the look. Do not copy the page, copy, logos, dashboard screenshots, or Astro project.

Live reference: https://shadcn-astro-flow-landing-page.vercel.app  
Product page: https://shadcnstudio.com/templates/flow-saas-template  
Captured: 2026-09-01

The part that matters for printLe is the **inner dashboard** in the hero (sidebar + cards), not the hero / logos / pricing / testimonials / blog around it.

## Do not do

- Do not switch `web/` to Astro because the preview is an Astro build. The same template exists in Next.js. printLe stays Vite + React.
- Do not buy or vendor the Flow template into this repo unless a license is purchased and reviewed.
- Do not add a marketing landing page, pricing table, logo cloud, or blog to the print queue.
- Do not copy Flow’s product name, dashboard mock data, or brand logos.

## Design summary

Quiet SaaS: near-black on off-white, Geist, generous whitespace, 10px radii, pill header actions, card grids, light and dark. Energy is medium. No green forest leftover from the first rewrite skin.

## Tokens

Observed from the live demo (Firecrawl branding scrape). Inferred values are marked.

| Role | Light | Dark (inferred from the dark preview) |
|---|---|---|
| Background | `#FFFFFF` | `#0A0A0A` |
| Surface / card | `#FFFFFF` with a 1px `#E5E5E5` edge | `#171717` |
| Muted surface | `#F5F5F5` | `#262626` |
| Primary text | `#171717` | `#FAFAFA` |
| Muted text | `#737373` (inferred) | `#A3A3A3` |
| Primary button | `#171717` on `#FAFAFA` | `#FAFAFA` on `#171717` |
| Secondary button | `#F5F5F5` on `#171717` | `#262626` on `#FAFAFA` |
| Accent | none beyond black/white; status uses semantic green/red | same |
| Radius | 10px on buttons, inputs, cards | same |
| Spacing unit | 8px | same |
| Type | Geist, then system-ui. Headings ~48/36 on marketing; **app UI 13–14px**, page titles ~24–28px | same |

Primary buttons are solid, no drop shadow. Inputs are 10px radius, transparent or white fill, hairline border.

## What to take into printLe

**App shell** (from the dashboard mock in the hero):

- Left sidebar, grouped labels, 16px stroke icons
- Compact top bar with a page title and a small role/status chip
- Main column as a card grid, not a long marketing scroll
- Quota and job stats as small metric cards (label, big number, optional delta) like “Total visitors / 23.02K”
- Held jobs as a list inside a card, not a marketing testimonial row

**Chrome:**

- Light, dark, and system theme
- Geist + Tailwind + shadcn/ui primitives + Lucide
- Theme shadcn to these tokens. Do not ship default shadcn colors if they drift
- Header actions: ghost “Log in” and solid “Try demo” become **Sign in** (ghost) and **Add to queue** / **Add user** (solid)

**Login:**

- Same tokens. Centered card or split pane is fine
- Big product line, muted one-sentence pitch, solid primary submit
- No logo cloud, no “Start building now” hero illustration of a fake analytics dashboard

## What not to take

Hero headline + dashboard screenshot, trusted-by logos, bento marketing features, testimonial carousel, three-tier pricing, FAQ accordion, blog with TOC, newsletter footer. Those are a public marketing site. printLe can grow a separate marketing page later; it is not Release 0.1.

## Agent build instructions

1. Keep `web/` as Vite + React. Add Tailwind v4, shadcn/ui, Lucide, Geist.
2. Replace the two overlapping CSS skins in `web/src/styles.css` (forest green vs zinc) with one token set from the table above.
3. Restyle existing screens only: login, queue, users, planned placeholders. Do not invent Flow sections.
4. Add theme toggle (light / dark / system) on the shell and login.
5. Manual duplex, hardware duplex, and forced grayscale are product options, not visual motifs. They belong in the print-options row.
6. When in doubt, match the **dashboard mock density**, not the **48px marketing H1**.
