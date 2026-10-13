# Users and reports

Users & Reports shows the directory and usage summary. Preview lists sample people, including Alex Rivera, Sam Chen, and Jordan Lee.

## Sub-features

- `users-open` shows the Users & Reports heading.
- `users-sample` lists the sample directory names.

## How to get to it (user POV)

- Choose `Users & Reports` in the Manage section of the sidebar.
- On a phone, open the menu, then choose `Users & Reports`.

## Driving it with drive.mjs

Preconditions:

- `doctor.py` exits 0.
- `drive.py open` is on `#preview`.

- **Open the page.** Choose `Users & Reports`. Run `node .cursor/skills/verify-printle/scripts/drive.mjs click "Users & Reports"`. `drive.mjs text` contains `Users & Reports`, `Alex Rivera`, and `Sam Chen`.
- **Proof.** Run `drive.mjs shot /tmp/printle-verify/<run-id>/users-reports.png`. The screenshot shows the preview banner and the sample names.

## Gotchas

- Adding a user, changing a role, or exporting CSV from a signed-in session writes or downloads shared data. This recipe only reads the preview.
- The button name is `Users & Reports`, including the ampersand.
