---
name: verify-printle
description: Drive the printLe web UI the way a user would and capture proof. Use when a change touches layout, navigation, rendered data, or a user flow in the React app and needs evidence from the running UI. Read-only against the shared dev stack; signed-in mutations stay out of this skill.
---

# Verify printLe

printLe is a self-hosted web print queue: a React UI (Vite) and a Spring Boot API. The surface an agent can drive safely is the browser. The API, Docker Compose, and the in-app Fake Printer are supporting surfaces, not the thing to click through.

The dev stack is a single shared instance. Compose project `printle` publishes the UI on `http://127.0.0.1:5173` and the API on `http://127.0.0.1:8081`. Postgres, uploaded PDFs, accounts, and the Fake Printer all live in that one instance. A second copy on the same ports is not possible, and a second copy on other ports would still be a different database. Do not start another stack to verify.

## Launch

Verification does not start the app. Drive the stack the user already has running.

Ready means all three are true:

- `curl -sf -o /dev/null http://127.0.0.1:5173/` returns successfully.
- `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/auth/me` returns `200` or `401` (the API answered; `401` is a signed-out session).
- `docker ps --filter name=printle-web-1 --filter name=printle-server-1 --format '{{.Names}} {{.Status}}'` shows both containers healthy.

If the stack is down, stop and tell the user. Starting it (`docker compose -f compose.yaml -f compose.dev.yaml up`) boots their database and is outside this skill.

There is no teardown of the server. Cleanup closes only the browser this run started.

## Doctor

Run this before driving. It is read-only.

```bash
python3 .cursor/skills/verify-printle/scripts/doctor.py
```

Exit 0 means the shared UI and API are answering and the UI container is the Compose service `printle-web-1`. Exit 1 names the failed check. Do not drive a different port, a production build served elsewhere, or an instance this script cannot identify.

Doctor also prints whether `/api/auth/me` is `200` (someone is signed in via the browser cookie jar — not this script) or `401`. Either value is acceptable. The script sends no cookies and never logs in.

## Drive

The safe drive is the sample preview: `http://127.0.0.1:5173/#preview`. It is the same Vite app with the hash parsed in `web/src/App.tsx`. The sample user is Alex Rivera, role ADMIN. No cookie, password, or API write is involved. Jobs, printers, users, and settings on that screen are sample data rendered in the browser.

Drive it with the bundled Playwright helper and the headless Chromium already on this machine. Run the commands from the repo root. The first machine to use the helper runs `npm install` once inside `.cursor/skills/verify-printle/scripts/` (Playwright 1.61.1, two packages). Node is `/home/sull/.vite-plus/bin/node` when `node` is not on `PATH`.

```bash
node .cursor/skills/verify-printle/scripts/drive.mjs open
node .cursor/skills/verify-printle/scripts/drive.mjs click "My profile"
node .cursor/skills/verify-printle/scripts/drive.mjs text
node .cursor/skills/verify-printle/scripts/drive.mjs shot /tmp/printle-verify/$RUN_ID/profile.png
node .cursor/skills/verify-printle/scripts/drive.mjs close
```

`open` goes to `#preview` at 1440×900 and waits until the heading `Print dashboard` and the button `Preview` are visible. `click` clicks a sidebar button by its visible name (`Print queue`, `My profile`, `Settings`, `Printers`, `Fake Printer`, `Users & Reports`). `text` prints the body text. `shot` writes a PNG. `click` and `text` reuse the browser `open` started; they fail if no session is open.

Pages are buttons, not routes. The address stays `http://127.0.0.1:5173/#preview` on every page. Proof of navigation is the new heading in `text`, not the URL.

Phone width is a separate session flag, because layout bugs here show up at 390px:

```bash
node .cursor/skills/verify-printle/scripts/drive.mjs open --width 390 --height 844
```

At 390px the sidebar is a sheet. Open it with `click-selector '[data-sidebar="trigger"]'` before clicking a nav button. Close the sheet by clicking the same trigger again after navigation if the next assertion needs the page underneath.

Do not sign in, submit the Getting started setup, upload a PDF, release a job, or enable the Fake Printer from a verification run. Those write to the shared database. If a change can only be proved that way, ask the user first and say exactly what will be created.

Viewport and theme are sticky in the page (`localStorage` key `printle-sidebar`, `printle-theme`). The helper uses a fresh browser context, so it does not touch the user's browser profile.

## Evidence

Write proof under `/tmp/printle-verify/<run-id>/`. Use one directory per run, named with the date and a short feature id, for example `/tmp/printle-verify/2026-09-26-print-queue/`.

A passing proof contains:

- `doctor.txt` — stdout of `doctor.py`.
- `action.txt` — the `drive.mjs` commands run, in order.
- `state.txt` — `drive.mjs text` after the action, showing the heading and the sample user.
- a PNG from `drive.mjs shot` taken after the action, with the preview banner visible.

Standards:

- Exercise the click path. Reloading `#preview` only proves the first page.
- Record the action and the resulting heading, not only the final screenshot.
- Preview data is sample data. Seeing Alex Rivera proves the preview shell, not that the API stored anything.
- Do not call test-only endpoints or set React state from the console.
- Side effects to look for are the ones the UI claims. If a control says it saved, confirm through a second view (reload, or the API with a session the user provided). The preview path has no such side effect.

## Cleanup

```bash
node .cursor/skills/verify-printle/scripts/drive.mjs close
```

That closes the browser this run launched and removes its session file. It does not stop Compose, delete volumes, or remove `/tmp/printle-verify/`. Proof stays after cleanup. Confirm the PNG is still there before declaring the run finished.

If `drive.mjs` was killed and a Chromium child remains, read the pid from `/tmp/printle-verify/session.json` and kill that pid only. Never kill by process name: other Chromium and the user's Compose stack must stay up.

## Helpers

- `python3 .cursor/skills/verify-printle/scripts/doctor.py` — read-only readiness check. Exit 0 or 1, no arguments. Python standard library only.
- `node .cursor/skills/verify-printle/scripts/drive.mjs open|click|click-selector|text|shot|close` — one headless browser session against `#preview`.

Chromium is the headless shell at `~/.cache/ms-playwright/chromium_headless_shell-1228/`. The helper does not download a browser. `npm install` inside `scripts/` fetches the `playwright` npm package once if `node_modules` is absent. No second dev server.

## Feature map

Read `.cursor/skills/verify-printle/features/README.md` before driving, then follow the feature file for the behavior under test. A proof that only opens the dashboard is incomplete when the change is on another page the map lists.
