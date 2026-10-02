# My profile

My profile shows the signed-in member's allowance: Pages left, Printed, Reserved, and Role, plus a member card for Alex Rivera in the preview.

## Sub-features

- `profile-open` shows the My profile heading and Alex Rivera.
- `profile-metrics` shows the four allowance figures with Role on its own line at phone width.
- `profile-gap` keeps the title close to the figures.

## How to get to it (user POV)

- Choose `My profile` in the Workspace section of the sidebar.
- On a phone, open the menu, then choose `My profile`.

## Driving it with drive.mjs

Preconditions:

- `doctor.py` exits 0.
- `drive.py open` is on `#preview` and the Print dashboard heading is visible.

- **Open profile.** Choose `My profile`. Run `node .cursor/skills/verify-printle/scripts/drive.mjs click "My profile"`. `drive.mjs text` contains `My profile` and `Alex Rivera`.
- **Read figures.** Stay on the page. `drive.mjs text` contains `Pages left`, `Printed`, `Reserved`, and `Role`.
- **Phone wrap.** Close and reopen at phone size, open the sheet, then choose `My profile`. Run `drive.mjs close`, `drive.mjs open --width 390 --height 844`, `drive.mjs click-selector '[data-sidebar="trigger"]'`, and `drive.mjs click "My profile"`. The heading is `My profile`.
- **Proof.** Run `drive.mjs shot /tmp/printle-verify/<run-id>/my-profile.png`. The screenshot shows the preview banner, the heading, and the figures.

## Gotchas

- Role is the figure that wraps. A screenshot that clips the second row has not shown the page.
- The title-to-figures gap is the margin under the heading. Compare the screenshot with the heading and the figures both in frame.
- Account menu also reaches the profile, but the sidebar button is the entry this map drives.
