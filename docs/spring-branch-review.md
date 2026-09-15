# Spring rewrite branch review — 2026-09-14

The useful carry-over is `37b524a` followed by `c4b6535`, with the fixes below. Both commits already exist on the local `ui-improvements` branch; the Spring rewrite branch is two commits behind it. Do not merge the old restoration branches.

Remote refs were refreshed with `git fetch --all --prune`. This review covers every local and remote branch, grouping matching local/remote refs together. The baseline is `feature/rewrite-spring-compose` at `6b7be1d`. Checkpoint refs and the `origin/HEAD` alias are not separate development branches.

| Branch | Tip | Relationship to rewrite | Recommendation |
|---|---|---|---|
| `main` / `origin/main` | `e9eec96` | Ancestor, 36 commits behind | Keep as legacy reference. Page selection is the main remaining user-facing behavior to finish carrying over. |
| `feature/rewrite-spring-compose` / matching origin ref | `6b7be1d` | Baseline | Already contains direct IPP enrollment, CUPS integration, quotas, ACLs, reporting, retention, manual duplex through CUPS, and session security fixes. |
| `feature/jipp-csv-ratelimit` / matching origin ref | `37b524a` | One commit ahead | Carry over after fixing printing and rate-limit issues. Much broader than its branch name suggests. |
| `ui-improvements` (local only) | `c4b6535` | Two commits ahead; includes `37b524a` | Carry over the panel improvements after backend fixes and frontend completion. |
| `origin/copilot/featurerewrite-spring-compose` | `b49a99f` | Already merged through `f885128` | Nothing to add. |
| `origin/copilot/featurerewrite-spring-compose-again` | `3f9ee85` | Two divergent commits, only sidebar restoration | Superseded by the current sidebar implementation. No distinct product feature found. |
| `origin/copilot/featurerewrite-spring-compose-another-one` | `78fb1bb` | Two divergent commits, only App restoration | Reject. Its `App.tsx` contains corrupted TSX, including the initial login/loading render. Current rewrite restores valid source. |
| `origin/copilot/featurerewrite-spring-compose-yet-again` | `7db5b41` | Two divergent commits, only stylesheet restoration | Reject. Its CSS contains malformed declarations such as `background:card)` and `border-r999px`; the rewrite has subsequent styling fixes. |

## What to add

1. **Page-range printing.** `37b524a` adds `PdfSelection`, a `pages` upload parameter, persisted `pageRange`, and migration V8. Ranges reject invalid or out-of-bounds input and count quota against the selected document. Add a page-range input to the upload forms and show the selection in job details. The frontend `Job` type currently omits `pageRange`.
2. **Direct IPP improvements.** Replace the handwritten client codec with JIPP, support Print-Job-only printers as well as staged Create-Job/Send-Document delivery, and move direct submission network calls outside the preparation transaction. This does not remove network I/O from all transactions: polling still does it.
3. **Direct IPP manual duplex.** Add odd/flip/even delivery, expanded copies, blank backs for odd-length documents, and the one-page completion fix. Retain physical printer testing for tray orientation and copy order.
4. **CSV user import.** Add the existing admin endpoint, validation preview, per-row results, generated temporary passwords, Everyone-group membership, and audit records. Complete the UI with upload, preview, explicit import, and a clear presentation of credentials returned by the actual import. Preview-generated passwords are regenerated during import.
5. **CSV report formatting.** Commons CSV replaces manual escaping. Export already exists on the rewrite; this improves its implementation. Despite the commit description, the new code is not streaming: it loads all completed jobs and writes a `StringWriter` before returning.
6. **Login and upload throttling.** Bucket4j adds 429 responses and Retry-After. Repair proxy identity handling and bound bucket storage before relying on it.
7. **Interactive fake printer.** Add the token-gated IPP endpoint and admin panel for inspecting requests, responses, document page counts/checksums, and changing mock job states. This complements the existing CUPS mock fleet.
8. **Panel improvements.** `c4b6535` adds metrics, searchable/filterable tables, and consistent cards and controls across profile, printers, users/groups, reports, settings, and the fake printer. It reuses the existing table infrastructure; it is not a new TanStack v8 migration as the commit message suggests.

## Fix before integration

### High: forced monochrome regression

In `server/src/main/java/io/printle/ipp/DirectIppClient.java:95`, a color printer with an empty `print-color-mode-supported` list is now accepted. The request then omits `print-color-mode`, allowing the device's default color behavior. The baseline rejected this case. Restore the fail-closed check and add a printer fixture that reports color support but omits supported color modes. Also exercise substituted-attribute responses against the forced-color requirement; the generic response handler accepts all success codes.

### High: predictable preflight errors strand jobs

`JobService.prepareRelease()` commits `beginDirectSubmission()` before `executeDirect()` calls `ipp.prepare()` (`JobService.java:128`, `:200`). If capability probing fails, copies are unsupported, or the device stops accepting jobs, the job remains `SUBMISSION_UNKNOWN` despite never reaching submission. Subsequent release is rejected and quota remains reserved. Restore a safe held state for failures known to occur before submission, while retaining the no-automatic-resend behavior for ambiguous delivery failures. Cover both cases in tests.

### High: spoofable login IP buckets

`LoginRateLimitFilter.java:42` trusts the first supplied `X-Forwarded-For` address. `web/nginx.conf:8` appends to that header, preserving a caller's forged first entry. Changing the header bypasses the per-IP bucket; varying email addresses also avoids a single email bucket. Define a trusted proxy boundary and overwrite untrusted forwarding headers at the edge. Add a regression test through that boundary. The maps in `RateLimitService` also never evict entries, so arbitrary identities accumulate indefinitely; use bounded, expiring storage.

### Medium: incomplete CSV validation and feedback

`UserImportService.getField()` checks `isMapped()` but then calls `record.get()` even when a short row has no value for that header. Such a row can escape as an exception instead of a row-level validation result. Validate record width or use a value-presence check. The status error also advertises `DISABLED`, while the actual enum is `SUSPENDED`. Add short-row and malformed-input cases before wiring the import screen.

### Medium: misleading permission copy

`web/src/App.tsx:639` says users can release to any enabled printer. Server authorization requires printer ACLs. Describe access as limited to permitted printers, and distinguish manager/operator capabilities where applicable.

## Local work worth retaining

The current checkout has uncommitted changes beyond either branch tip. They were inspected separately and were not included in the committed-branch validation:

- PostgreSQL Testcontainers configuration, production Flyway migrations enabled during integration tests, and `PostgresMigrationIntegrationTest`. The upgrade test exercises V2-to-current migrations, quota backfill, held-job expiry, and ledger preservation after job deletion. This is a valuable integration gate because the committed tests use H2 with Flyway disabled.
- Further styling changes and tabular metric numerals in `web/src/styles.css` and `web/src/components/ui.tsx`.
- README updates documenting the changed test setup.

The untracked `.mvn.bak` and `web/dist.bak` directories are backups, not feature candidates.

## Integration order

1. Use the existing `37b524a` → `c4b6535` sequence as the candidate; there is no need to reconstruct it from Copilot branches.
2. Fix the printing and throttling findings, then the CSV and permission-copy issues.
3. Finish page-range and CSV-import UI flows.
4. Include the local PostgreSQL migration-test work and verify it with Docker available.
5. Run frontend tests/build, backend verification, Compose printing scenarios, and physical direct-IPP/manual-duplex checks before advancing the rewrite branch.

This review did not merge branches or change application code.

## Validation performed

An isolated archive of committed `ui-improvements` (`c4b6535`) was used, excluding local edits. It includes the exact backend from `37b524a`. Existing installed frontend dependencies were reused.

- Frontend: all 20 tests passed; TypeScript and Vite production build passed. Vite reported a bundle-size warning.
- Backend: Maven `verify` passed with JDK 21; all 36 tests passed. These committed tests use H2 and do not validate Flyway migrations.
- No physical printing, Compose scenarios, browser automation, or execution of the uncommitted PostgreSQL tests was performed in this review.
