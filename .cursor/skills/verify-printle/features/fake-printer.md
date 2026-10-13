# Fake Printer

Fake Printer explains that the preview has no IPP endpoint. The live simulator, which receives real print jobs, is only available after an administrator signs in.

## Sub-features

- `fake-open` shows the Fake Printer heading.
- `fake-preview-notice` tells the viewer to sign in before the simulator will run.

## How to get to it (user POV)

- Choose `Fake Printer` in the Manage section of the sidebar.
- On a phone, open the menu, then choose `Fake Printer`.

## Driving it with drive.mjs

Preconditions:

- `doctor.py` exits 0.
- `drive.py open` is on `#preview`.

- **Open the page.** Choose `Fake Printer`. Run `node .cursor/skills/verify-printle/scripts/drive.mjs click "Fake Printer"`. `drive.mjs text` contains `Fake Printer` and `Sign in to use the fake printer`.
- **Proof.** Run `drive.mjs shot /tmp/printle-verify/<run-id>/fake-printer.png`. The screenshot shows the preview banner and the sign-in card.

## Gotchas

- Enabling the fake printer is an API write on the shared backend, and a restart changes its address. Do not click enable.
- The page in preview never polls. An empty event log there is the sample state, not a broken simulator.
