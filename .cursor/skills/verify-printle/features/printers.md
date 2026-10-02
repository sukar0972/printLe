# Printers

Printers lists the fleet and its pages-printed figure. Preview shows sample printers. Adding a printer is refused until an administrator signs in.

## Sub-features

- `printers-open` shows the Printers heading and fleet figures.
- `printers-add-refused` tells a preview user to leave preview before connecting a printer.

## How to get to it (user POV)

- Choose `Printers` in the Manage section of the sidebar.
- On a phone, open the menu, then choose `Printers`.

## Driving it with drive.mjs

Preconditions:

- `doctor.py` exits 0.
- `drive.py open` is on `#preview` as Alex Rivera, who sees the Manage section.

- **Open printers.** Choose `Printers`. Run `node .cursor/skills/verify-printle/scripts/drive.mjs click "Printers"`. `drive.mjs text` contains `Printers` and `Pages printed`.
- **Proof.** Run `drive.mjs shot /tmp/printle-verify/<run-id>/printers.png`. The screenshot shows the preview banner and the fleet figure as a number.

## Gotchas

- The fleet figure label is `Pages printed` followed by a number. There is no `Fleet volume` label.
- Do not submit Add IPP printer. Preview rejects it, and a signed-in submit would register a printer on the shared instance.
