# printLe v1.0 — recorded behavior

The original Node implementation is archived at git tag `legacy-v1.0` (commit `e9eec96`). This file is the working record of what that code actually did, which bugs were fixed in later commits, and which behaviors must not return in the rewrite.

The rewrite is a different product. v1.0 was a **browser that immediately sent a file to a user-typed IPP URL**. The rewrite is a **self-hosted held-job queue** with accounts, quotas, and (later) CUPS delivery.

## What v1.0 actually shipped

Two services, orchestrated by `docker-compose.yml`:

| Piece | Stack | Role |
|---|---|---|
| `printle-web-app` | React 18, Vite, Tailwind, Nginx | Single-page UI: Print / History / Settings |
| `printle-server` | Node 20, Express, multer, `pdf-lib`, `ipp` | Accept an upload, optionally rewrite the PDF, `Print-Job` to an IPP URL |

Default ports: web `80`, API `3001`. Nginx had an `/api/` reverse proxy to the backend, but the UI **did not use it**. It called a user-configured `serverUrl` (default `http://localhost:3001`) from the browser. Compose also published `3001` on the host.

There was no authentication, no database, no job store, no CUPS, no quotas, and no user accounts.

### Features that really worked

- Drag-and-drop or file picker, then an immediate print request.
- Page-range rewrite on PDFs (`1-3, 5`) using `pdf-lib` copy/create.
- Automatic duplex as IPP `sides = two-sided-long-edge`.
- Manual duplex: server extracts odd then even pages; UI shows a “flip the stack” modal between the two jobs.
- Grayscale as IPP `print-color-mode = monochrome` (not by rewriting PDF pixels).
- Live printer probe: `POST /api/printer-status` runs IPP `Get-Printer-Attributes` (`printer-name`, `printer-state`, `printer-is-accepting-jobs`), timeout 5s, UI polls every 30s.
- Dark mode and printer/server settings persisted in `localStorage` key `printle_settings`.
- IPP success includes `successful-ok-ignored-or-substituted-attributes`, not only `successful-ok`.

### API

- `GET /` — `"PrintLe Server is running!"`
- `POST /api/printer-status` JSON `{ printerUrl }` — reachability object, or `reachable: false` with `error` (HTTP 200 even on failure).
- `POST /api/print` multipart: `file`, `printerUrl`, optional `pages`, `grayscale=true`, `duplex` = `auto` | `odd` | `even`.

The printer URI always came from the client. The server would print to any IPP URL it could reach.

### Print handling details

- Non-PDF files were forwarded as `application/octet-stream`. Page ranges and manual duplex were later rejected for non-PDFs.
- Manual duplex odd/even used **0-based index of the already filtered PDF**, not original page numbers. Range `2-5` then “odd” printed original pages 2 and 4.
- Even pages were kept in document order. After a physical flip, many trays need reverse order; v1.0 did not reverse them.
- `requesting-user-name` was hardcoded `PrintLe-User` / `PrintLe-Healthcheck`.
- Copies, short-edge duplex, media size, tray, and orientation were never sent to the printer.
- Uploads landed in `printle-server/uploads/` and were deleted after the IPP callback (best-effort `unlink`). Compose bind-mounted that directory to the host.

## UI that looked real but was not

- **History is fake.** Seeded with `quarterly_report.pdf`. New jobs are `queued`, then forced `completed` after 5 seconds regardless of the printer. History is in-memory only; refresh loses it.
- **Paper size** (`Letter` / `A4` / `Legal`) stored, never sent.
- **Notifications** stored, never used.
- **`defaultColor`** stored; the actual grayscale flag is a per-job toggle and starts false every upload.
- **File types.** Picker and copy said `PDF, PNG, JPG, DOCX up to 10MB`. The server had no 10MB limit. Nginx allowed 20MB. Images and Office files were accepted by the UI; only PDFs got page/duplex processing.
- Default settings pointed at a fictional printer `ipp://192.168.1.50:631/printers/main` named `Office Jet Pro`. On some LANs that address is a real device.

Prototype leftovers `src/App3.tsx` and `src/app2.tsc` existed until the April 2026 hardening commit. They were unused copies of the same UI.

## Commit history — what we actually fixed

Chronological, only commits that changed the old app or its packaging.

| Commit | Date | What happened |
|---|---|---|
| `1b66f23` / `5d96a81` | 2025-12-11 | README-only start. |
| `1d029e2` | 2025-12-12 | First Release 1.00. Node IPP proxy + React UI. |
| `dbb242e` | 2025-12-12 | “Fixed dependencies”: added `.gitignore`, Vite/TS config so the frontend could actually build. |
| `f9941f9` | 2025-12-12 | “added dependencies”: **removed committed `node_modules`** from both apps (huge commit). The first release had shipped installed packages in git. |
| `6d5ac60` | 2026-04-16 | **Main hardening commit.** Printer status, page-range validation, PDF-only page/duplex, tests, UI status, deleted `App3.tsx` / `app2.tsc`. |
| `797d2db` | 2026-04-16 | GitHub Actions: Node 20 backend tests + frontend build. |
| `e9eec96` | 2026-04-16 | Favicon/README polish. Tagged `legacy-v1.0`. |

### Bugs that existed in First Release (`1d029e2`) and were fixed in `6d5ac60`

These are the important ones. The first-release print path would **print the whole document** when the page range was invalid.

1. **Invalid page ranges printed everything.** `getPageIndices('99', 2)` returned `[]`, the empty list was treated as “no filter”, and the original PDF went to the printer. Same for `abc`, `4-2`, `1,,3`. The hardening commit throws, and a test asserts the printer is never called.
2. **Out-of-range pages were silently dropped** instead of rejected. A range of `1-99` on a 2-page file printed pages 1–2 with no error.
3. **Page-range and manual duplex on non-PDFs** were ignored; the raw file still printed.
4. **Missing-file 400 handler crashed.** `if (!file \|\| !printerUrl) { fs.unlinkSync(file.path) }` threw when `file` was absent.
5. **Multer destination was cwd-relative** (`dest: 'uploads/'`) while the directory was created under `__dirname`. Docker vs local cwd could write to different places. Fixed to `path.join(__dirname, 'uploads')` with `recursive: true`.
6. **`job-id` access could throw** if the printer omitted job attributes. Became optional chaining, default `null`.
7. **IPP error objects** were dumped raw into JSON; later only `err.message` is returned.
8. **App was not testable.** Logic was inlined and `listen()` ran on import. `6d5ac60` extracted `createApp`, `buildPrintJob`, `checkPrinterReachability`, `getPageIndices` and added `node:test` coverage against a mock IPP printer.

### Fix recorded in a comment, not a later commit

First Release already contained:

> NOTE: We REMOVED the "convertToGrayscale" function here because it was causing blank pages. We will handle grayscale via IPP attributes below.

Pixel-level PDF grayscale conversion printed blank pages. Do not bring that approach back. Use printer/CUPS color mode.

## Abnormal and unsafe behavior that was still true at `legacy-v1.0`

Hardening did **not** fix these. Treat them as landmines, not features.

- **No auth. CORS `origin: '*'`. Client-chosen IPP URL.** Anyone who can hit the API can print to any IPP endpoint the container can reach. That is unauthenticated printing plus SSRF.
- **Printer probe timeout does not abort the socket.** It only ignores a late callback. Hung IPP connections leak.
- **No server-side file size limit** (multer unlimited). UI said 10MB, nginx 20MB, Node accepted whatever got through.
- **MIME type is trusted from the client.** No PDF header check.
- **Manual duplex even-page order is not reversed** after the flip prompt.
- **Odd/even is “every other page of the rewritten PDF”**, not original odd/even page numbers.
- **Status endpoint returns HTTP 200 for unreachable printers.** Clients must read `reachable`.
- **`/api/print` logs original filenames and settings to stdout.**
- **Backend port 3001 is published** even though nginx already proxies `/api/`.
- **History, paper size, notifications, 10MB copy, and Office/image support were cosmetic.** Do not reimplement them as if they were real.

## How this differs from the rewrite

| | v1.0 Node app | Current rewrite (`server/` + `web/`) |
|---|---|---|
| Product | Immediate IPP print from the browser | Held PDF queue with accounts |
| Auth | None | Email/password, sessions, CSRF, roles |
| Printer | User-typed IPP URL | Printer table only; CUPS not wired yet |
| Delivery | `ipp` `Print-Job` from the API container | Intentionally not implemented |
| Files | Any type the UI allowed; temp then delete | PDF magic-byte + PDFBox; stored until cancel |
| Page range | Server rewrote the PDF | Not implemented (planned after capability negotiation) |
| Duplex | Auto IPP long-edge, or manual odd/even split | Stored `ONE_SIDED` / long-edge / short-edge only; **manual duplex is required and not modeled yet** |
| Color | IPP monochrome attribute (forced) | Stored `COLOR` / `MONOCHROME`; **must be enforced at the printer, not only stored** |
| History | Fake client list | Real `PRINT_JOB` rows |
| Status | IPP Get-Printer-Attributes every 30s | No live printer probe |
| Limits | Inconsistent 10/20/unlimited | 25 MB, PDF only |
| Install | Compose, Node images, host-mounted uploads | Compose, Java API, Postgres, named volumes |

## Carry into the rewrite (do not lose)

When printer delivery is added, keep these lessons:

1. **Forced grayscale is required.** Send CUPS/IPP `print-color-mode=monochrome`. Never rewrite PDF pixels; that printed blank pages. If the printer ignores or substitutes color mode, fail rather than print color. v1.0 treated `successful-ok-ignored-or-substituted-attributes` as success, which could silently drop grayscale.
2. **Hardware duplex is required** on printers that support it: CUPS/IPP `sides` for long-edge and short-edge. v1.0 only sent long-edge.
3. **Manual duplex is required**, not optional. Keep the odd-pages / flip prompt / even-pages flow for printers without duplex hardware. Define original vs filtered page numbers, even-page order after the flip, an `AWAITING_FLIP` (or equivalent) state, and quota on printed sides. v1.0 used every-other-page of the rewritten PDF and did not reverse even pages.
4. **Invalid page ranges must fail closed.** Do not print the whole file, and do not silently clip out-of-bounds pages.
5. **Page range and manual duplex only apply to real PDFs**, after the file has been validated as a PDF. Apply range first, then odd/even split, and document that order.
6. **Printer reachability is `Get-Printer-Attributes`**, with a real timeout that cancels the attempt, and a UI that does not claim “online” from a stale or failed probe.
7. **Do not take a printer URL from the browser.** Printers are admin records; the print node talks to CUPS, not to a user-supplied URI.
8. **Job history must come from the server.** Client-side fake completion taught the wrong UX.
9. **Upload limits, MIME, and PDF parsing must agree** across UI, proxy, and API.
10. **Do not commit `node_modules`.** First release did; `f9941f9` had to delete them.

Source for all of the above remains `git show legacy-v1.0:<path>`.
