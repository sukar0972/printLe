# printLe verification map

This directory is the maintained source for verifying the user-facing behavior of printLe. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- The shared dev stack is already running: UI at `http://127.0.0.1:5173`, API at `http://127.0.0.1:8081`.
- `python3 .cursor/skills/verify-printle/scripts/doctor.py` exits 0 and names container `printle-web-1`.
- Drive `http://127.0.0.1:5173/#preview`. The sample user is Alex Rivera. The hash is the whole session; there is no separate data directory.
- Do not sign in, upload, release, or enable the Fake Printer. Those write to the shared database.
- Never start a second Compose stack. Ports 5173 and 8081 belong to the user's instance.

## Driving conventions

- Start every recipe from `#preview` on the Print dashboard unless its preconditions say otherwise.
- Click sidebar buttons by visible name through `node .cursor/skills/verify-printle/scripts/drive.mjs click`.
- Pages do not change the URL. Prove navigation with the heading in `drive.mjs text`.
- At 390px width, open the nav sheet with `drive.mjs click-selector '[data-sidebar="trigger"]'` before the nav click.
- Leave `/tmp/printle-verify/<run-id>/` in place during cleanup. `drive.mjs close` removes only the browser session.

## Proof and skip reporting

- Capture the click and the resulting heading, plus a screenshot that shows the preview banner.
- Preview content is sample data. It proves the screen renders, not that the API stored a row.
- Record the feature file and the entry point used with every artifact.
- Report an unreachable path with the command that failed. Do not mark it verified through a different page.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Print queue](./print-queue.md) covers the dashboard, status filters, and the quota figures.
- [My profile](./my-profile.md) covers the allowance figures, the Role wrap, and the quota gap under the title.
- [Settings](./settings.md) covers the settings dialog, appearance, and instance policy status shown in preview.
- [Printers](./printers.md) covers the fleet list and the preview refusal to add a real printer.
- [Fake Printer](./fake-printer.md) covers the preview explanation; the live simulator is out of bounds.
- [Users and reports](./users-reports.md) covers the sample directory and usage figures.
