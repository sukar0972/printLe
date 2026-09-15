# DESIGN.md: shadcn/ui Dashboard Study

## Source

- URL: https://ui.shadcn.com/examples/dashboard
- Capture date: 2026-09-03
- Evidence: rendered page structure and the official shadcn/ui dashboard source

## Design Summary

A dense, neutral application dashboard built around a persistent grouped sidebar, a thin page header, restrained metric cards, a large analytical panel, and a data table with local controls. The interface relies on borders, spacing, and typography rather than color or decoration.

## Design Tokens

- Colors: white canvas and surfaces, zinc-950 text, zinc-500 secondary text, zinc-200 borders, zinc-100 muted controls; inverse equivalents in dark mode.
- Typography: compact sans-serif UI, 12–14px controls and copy, 15px card titles, 24–28px page titles and values; medium or semibold weight.
- Layout: 256px sidebar, 49px header, 24px content padding, 16px grid gaps, 8px radii, hairline borders, nearly invisible shadows.

## Components and Patterns

- Grouped sidebar navigation with compact rows and a softly raised active item.
- Four equal metric cards with label, large value, and supporting context.
- Full-width analytical card with range control, subtle grid, and monochrome series.
- Bordered data workspace with title, search, filters, sortable columns, and compact rows.
- Responsive grids collapse while controls wrap horizontally.

## Agent Build Instructions

Preserve printLe’s workflows, content, and branding. Recreate the source’s hierarchy and density using native project components: muted zinc neutrals, one-pixel borders, compact typography, consistent 8px radii, and minimal shadow. Do not reuse source branding or copy.

## Rerun Inputs

workflow: firecrawl-website-design-clone  
source_url: https://ui.shadcn.com/examples/dashboard  
target_stack: React + CSS  
output: DESIGN.md

## Printer Fleet Table Reference

- Source: https://github.com/arhamkhnz/next-shadcn-admin-dashboard
- Screenshot supplied by the user on 2026-09-03.
- Pattern: one large rounded table card with title and supporting copy on the left; search and compact dropdown filters on the right; long bordered rows; small outlined state pills; segmented health bars; edit glyphs; and a quiet count/pagination footer.
- printLe mapping: opportunity ID → CUPS queue, account → printer, stage → CUPS state, priority → capabilities, health → printer readiness, value → page pricing, edit → printer policy dialog.

## User Directory Table Reference

- Screenshot supplied by the user on 2026-09-03.
- Pattern: title and primary action inside the table card, search beside the action, a spacious filter/selection toolbar, avatar-led identity rows, secondary metadata beneath primary values, status pills, overflow actions, and a rows-per-page footer.
- printLe mapping: role/team → account role and permission scope, workspace → page allowance policy, joined date → account creation timestamp, overflow action → existing account management dialog.
- Scale correction: constrain shadcn application pages to roughly 1380px on wide screens instead of stretching edge-to-edge. Use 15px base text, 13–14px table content, 12px secondary metadata, and 20–21px directory headings; avoid 9–10px text except for truly tertiary labels.

## Live Dashboard Typography Measurements

- Source: https://next-shadcn-admin-dashboard.vercel.app/dashboard/default
- Measured in the rendered application on 2026-09-03, rather than inferred from screenshots.
- Body: Geist at 16px/24px, weight 400.
- Primary application text: 14px/20px. This includes sidebar items, inputs, selects, ordinary buttons, table headers, table cells, and footer controls.
- Secondary metadata and badges: 12px/16px, generally weight 400–500.
- Table headers: 14px/20px at weight 500 with 44px header height.
- Table cells: 14px/20px with 12px secondary lines and approximately 63px row height.
- KPI values: 30px/30px at weight 500. Card titles are 16px/16px at weight 500.
- printLe must not use the previous 13px application-text override. Reserve 12px for genuine metadata and use 14px as the compact UI default.

## Branded Print Pass

- Screenshot supplied by the user on 2026-09-03.
- Adapt the visual confidence and hierarchy of a virtual card without implying payment, stored value, or credit.
- The printLe pass displays the authenticated member, role, pages remaining, monthly allowance, printed pages, and pages reserved in held jobs. It uses printLe’s mark and monochrome styling and links to profile settings.
