# Print queue

Print queue is the landing page of the preview. It shows the Print dashboard heading, four quota figures, a status filter row, and a sample job table.

## Sub-features

- `queue-open` shows the dashboard from the preview URL.
- `queue-filters` shows a status filter row with an All pill and counts.
- `queue-metrics` shows Pages left, Waiting, Reserved, and Printed on one line at phone width.

## How to get to it (user POV)

- Open `http://127.0.0.1:5173/#preview`.
- Choose `Print queue` in the Workspace section of the sidebar.
- On a phone, open the menu, then choose `Print queue`.

## Driving it with drive.mjs

Preconditions:

- `doctor.py` exits 0.
- No `drive.py` session is open.

- **Open dashboard.** Visit the preview. Run `node .cursor/skills/verify-printle/scripts/drive.mjs open`. The body text from `drive.mjs text` contains `Print dashboard`, `Preview`, and `Alex Rivera`.
- **Read filters.** Stay on the page. `drive.mjs text` contains `Search jobs, printers, or IDs` and a filter count for All.
- **Return from another page.** Choose `My profile`, then `Print queue`. Run `drive.mjs click "My profile"` and `drive.mjs click "Print queue"`. The heading text is `Print dashboard` again and the URL is still `#preview`.
- **Phone metrics.** Close the session and reopen at phone size. Run `drive.mjs close`, then `drive.mjs open --width 390 --height 844`. `drive.mjs text` contains `Pages left`, `Waiting`, `Reserved`, and `Printed`.
- **Proof.** Run `drive.mjs shot /tmp/printle-verify/<run-id>/print-queue.png` and `drive.mjs text` into `state.txt`. The screenshot shows the preview banner and the four figures.

## Gotchas

- The address does not change between pages. A URL check cannot tell Print queue from My profile.
- At 390px the nav buttons are inside the sheet. Click `[data-sidebar="trigger"]` before `Print queue`.
- Sample jobs are not in the database. Do not try to release one; the Print control in preview does not submit to the API.
