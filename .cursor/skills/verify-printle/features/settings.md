# Settings

Settings shows instance policy and system status for an administrator. In the preview the values are sample data and the controls do not save.

## Sub-features

- `settings-open` shows the Settings heading from the sidebar.
- `settings-status` shows the system status figures.

## How to get to it (user POV)

- Open the account menu at the bottom of the sidebar, then choose `Settings`.
- On a phone, open the menu, open the account menu, then choose `Settings`.

## Driving it with drive.mjs

Preconditions:

- `doctor.py` exits 0.
- `drive.py open` is on `#preview`.

- **Open settings.** Open the account menu, then choose `Settings`. Run `node .cursor/skills/verify-printle/scripts/drive.mjs click "Account menu"` and `node .cursor/skills/verify-printle/scripts/drive.mjs click "Settings"`. `drive.mjs text` contains `Settings` and `General`.
- **Proof.** Run `drive.mjs shot /tmp/printle-verify/<run-id>/settings.png`. The screenshot shows the preview banner and the Settings heading.

## Gotchas

- Saving policy from a signed-in session writes the shared database. This recipe stops at the rendered page.
- Do not toggle color printing or retention during verification.
