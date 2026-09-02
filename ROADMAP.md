# printLe implementation roadmap

This file tracks the work required to turn the current prototype into a dependable self-hosted print service. It is deliberately broader than a feature wish list. Printing software touches authentication, untrusted files, USB devices, operating-system services, and physical resources. Each part needs a clear failure mode and a way for an administrator to recover.

## Decisions already made

- printLe is a self-hosted web print queue.
- The backend stays on Java and Spring Boot with PostgreSQL.
- Docker Compose is the standard installation path.
- CUPS will run in the printLe stack instead of using an existing host installation.
- CUPS and a narrow print-node sidecar are part of the development stack; production hardening and physical-printer enrollment remain.
- USB printers must be identified by stable device attributes. Bus and device numbers are discovery hints, not printer identities.
- AirPrint and ordinary operating-system `Ctrl+P` printing are out of scope for now.
- Local accounts are supported. Enterprise SSO is optional and chosen by each installation.
- Authentik is the preferred first OIDC integration. WorkOS may be offered later as a managed enterprise option.
- `ADMIN` combines owner and administrator responsibilities.
- The other roles are `OPERATOR`, `MANAGER`, and `USER`.
- Users have monthly page allowances. Policies can later be applied by user or group.
- Printer access is controlled through ACLs.
- Jobs must support **hardware duplex**, **manual duplex**, and **forced grayscale**. These are product requirements, not printer-dependent extras.
- Hardware duplex is CUPS/IPP `sides` (`two-sided-long-edge` and `two-sided-short-edge`) on printers that can duplex themselves.
- Manual duplex is required for printers without duplex hardware: print odd pages, wait for a confirmed stack flip, then print even pages. It is a first-class job mode, not a fallback we might skip.
- Forced grayscale means the printer is instructed to print monochrome (`print-color-mode=monochrome` or the CUPS equivalent). A color PDF must still come out black and white. Do not rewrite PDF pixels to get there; that printed blank pages in v1.0. If the printer ignores or substitutes the color mode, treat that as failure, not success.
- Visual language follows the Flow shadcn look (near-black on off-white, Geist, 10px radii, light and dark). Details are in `docs/DESIGN.md`. Steal the look, not the Astro landing-page template.
- Enterprises may eventually pay for enterprise-only capabilities. The core licensing model has not been selected.

## What exists today

The current codebase already has:

- Spring Boot API and PostgreSQL persistence
- Flyway migrations
- Argon2id local password hashes
- Cookie-based server sessions and CSRF protection
- A bootstrap administrator
- Role constants for admin, operator, manager, and user
- User creation and last-admin protection
- PDF-only upload with PDFBox validation and page counting
- Held jobs, cancellation, file storage, and pending quota accounting
- Stored and delivered color (`COLOR` / forced `MONOCHROME`) plus one-sided, hardware duplex, and restart-safe manual duplex jobs
- Implemented services and screens for users, groups, printers, printer ACLs, jobs, quotas, pricing reports, settings, diagnostics, and audit events
- A React and Vite frontend
- Working queue, printer, user, group, report, and settings screens
- Dockerfiles, Docker Compose, health checks, persistent volumes, and CI checks
- Production/internal CUPS and print-node services plus a development fleet covering success, delay, cancel, abort, hold, stop, color, monochrome, simplex, duplex, jam, and offline behavior
- An authenticated, idempotent print-node API with discovery, CUPS job correlation, native IPP state polling, cancellation, web release, retry, and manual odd/flip/even control
- Immutable estimated cost accounting, CSV usage reports, configurable quotas/restrictions/retention, health diagnostics, and coordinated backup tooling

The next release work is concentrated in frontend decomposition and browser automation, physical-device enrollment and driver validation, OIDC/email, observability, rate limiting, secrets, and hardware/upgrade testing.

## Lessons from v1.0

The deleted Node app was an immediate IPP print client, not a queue. Full notes are in `docs/legacy-v1.0.md`. When printer delivery and print options are added, do not regress these:

- Invalid page ranges must reject the job. v1.0 originally printed the whole file.
- Forced grayscale must use CUPS/IPP color mode. Do not convert PDF pixels; that printed blank pages. If the printer ignores monochrome, fail the job instead of printing color.
- Hardware duplex and manual duplex are both required. Hardware duplex uses CUPS `sides`. Manual duplex keeps the odd/even plus flip-prompt flow from v1.0.
- Do not accept a printer URL from the browser. That was unauthenticated printing and SSRF.
- Job history and printer status must come from the server. The old History tab and 5-second "completed" timer were fake.
- For manual duplex, define original vs filtered page numbers, even-page order after a flip, and quota on printed sides. v1.0 used every-other-page of the rewritten PDF and did not reverse even pages.
- Upload size, file type, and PDF validation must match across UI, proxy, and API. v1.0 advertised PDF/PNG/JPG/DOCX up to 10MB while nginx allowed 20MB and Node had no limit.

## Release 0.1: finish the web application

### Frontend structure

- Split the current single `App.tsx` into routes, layouts, pages, components, and hooks.
- Add a real client-side router with protected routes and role-aware route guards.
- Keep the complete sidebar structure and make it collapsible on desktop.
- Add a mobile drawer or another usable small-screen navigation pattern.
- Add light, dark, and system theme modes.
- Use Tailwind CSS with shadcn/ui primitives and Lucide icons, themed to `docs/DESIGN.md`. Do not adopt the Flow Astro/Next landing template or its marketing sections.
- Add skeletons, empty states, error boundaries, toast notifications, confirmation dialogs, and retry actions.
- Return expired sessions to the login page without losing a clear explanation of what happened.
- Preserve keyboard navigation, visible focus states, semantic form labels, and screen-reader announcements.
- Add browser-level tests for login, navigation, upload, cancellation, user creation, permissions, and expired sessions.

### User management

- Edit a user's display name, email address, role, status, and individual quota.
- Suspend and reactivate accounts.
- Reset local passwords without revealing stored credentials.
- Require a password change after an administrator issues a temporary password.
- Add optional email invitations once outbound email is configured.
- Add pagination, search, filtering, and sorting.
- Show when an account was created and last signed in.
- Prevent an administrator from suspending, deleting, or demoting the last active administrator.
- Decide whether accounts are soft-deleted, anonymized, or permanently retained for audit history.
- Add a validated CSV import with dry-run preview, row-level errors, duplicate handling, and an audit record. A bulk import must never partially create users without showing exactly what succeeded.

### Groups

- Create, rename, and delete groups.
- Add and remove group members.
- Mark built-in groups as immutable where appropriate.
- Support group quotas and define how they interact with individual quotas.
- Expose group membership through administrator APIs and screens.
- Record group and membership changes in the audit log.

### Quotas

- Define the quota precedence rules. A reasonable starting point is: exemption, individual override, primary group policy, instance default.
- Decide whether copies count toward the page total. They should unless there is a compelling reason not to.
- Define how duplex printing is counted. Count printed sides, not sheets, unless the product language explicitly says otherwise.
- Reserve quota when a job is held, debit it when printing completes, and release it on cancellation or terminal failure.
- Make every quota ledger operation transactional and idempotent.
- Add administrator adjustments with a required reason.
- Handle month boundaries and installation time zones explicitly.
- Show users a readable explanation when a job would exceed their allowance.
- Separate page allowance from monetary cost accounting. Store an immutable calculated cost on each completed job using versioned per-printer rates for monochrome, color, paper size, and duplex; changing a rate must not rewrite history.
- Let administrators configure restrictions independently of quotas, starting with color, copies, page count, and printer access. Reject restricted jobs before reserving quota.

### Print-job lifecycle

- Replace ad hoc status changes with a documented state machine.
- Before CUPS submission, printLe owns `HELD` and `EXPIRED`. Manual duplex also needs the printLe-owned `AWAITING_FLIP` coordination state between its two physical submissions.
- After submission, preserve the IPP states without aliases: `PENDING`, `PENDING_HELD`, `PROCESSING`, `PROCESSING_STOPPED`, `CANCELED`, `ABORTED`, and `COMPLETED`. Store `job-state-reasons` separately and do not collapse `CANCELED` into `ABORTED` or assume every `COMPLETED` job was warning-free.
- Define which roles can view, release, retry, move, and cancel each job.
- Add configurable retention for held jobs, completed records, failed jobs, and uploaded files.
- Store an absolute `expires_at` on every held job when it is submitted. Later setting changes apply only to new jobs, and expiration must produce an idempotent `EXPIRED` transition that releases reserved quota and deletes the document payload.
- Add a scheduled cleanup process that keeps database records and stored files consistent.
- Let an administrator retry or cancel stuck jobs.
- Store failure codes separately from user-safe failure messages.
- Assign a searchable end-to-end trace ID to every job and include it in API, print-node, CUPS-correlation, and audit records. Provide an admin timeline without exposing document contents or secrets.
- Add checksums so corrupt or mismatched stored files are caught before printing.
- Keep original filenames for display, but never use them as filesystem paths.

### Print options

The current job row stores `COLOR` / `MONOCHROME` and `ONE_SIDED` / `TWO_SIDED_LONG_EDGE` / `TWO_SIDED_SHORT_EDGE`. That is not enough.

- Add a stored duplex mode for **manual duplex** alongside hardware long-edge and short-edge. The UI must offer all three: one-sided, hardware duplex, manual duplex.
- Hardware duplex maps to CUPS `sides`. Do not offer it on a printer that does not report duplex capability; offer manual duplex instead.
- Manual duplex is a two-stage release: print odd pages, pause for an operator or user to flip and reload the stack, then print even pages. Add an explicit job state for the wait (for example `AWAITING_FLIP`) so a restart cannot print the even sides twice or skip the flip.
- Decide and test even-page order after the flip (document order vs reversed). v1.0 printed even pages in document order, which is wrong for many trays.
- Odd/even must be defined against original PDF page numbers, or against the page-range result if a range was applied, and documented either way. v1.0 used 0-based index of the already filtered PDF.
- **Forced grayscale** is the default user-facing color choice. Store `MONOCHROME` and send it all the way to CUPS/IPP. Do not rely on the PDF already being grayscale.
- If CUPS reports `successful-ok-ignored-or-substituted-attributes` and color mode was substituted away from monochrome, fail the job. “Forced” means color output is not acceptable.
- Never implement grayscale by altering PDF content streams or rasterizing pages. That caused blank pages in v1.0.
- Count quota on printed sides for both hardware and manual duplex.
- Keep page-range rewriting PDF-only, fail closed on invalid ranges, and apply it before odd/even splitting when both are set.

### Printer records before CUPS

- Finish CRUD APIs and screens for logical printer records.
- Store location, notes, capabilities, enabled state, and maintenance state.
- Model supported paper sizes, color capability, duplex capability, and default options.
- Do not claim a printer is online until a print node has reported it.
- Show a clear `Not connected` state before CUPS integration exists.
- Model normalized supply and fault states, including out of paper, paper jam, paper problem, no toner, service requested, offline, and unknown. Keep raw device reasons for diagnostics.
- Add an instance policy for release to a printer in error: `ALLOW`, `WARN`, or `BLOCK`, with optional administrator-written user guidance. Authorization and policy checks must be repeated server-side at release time.

### ACLs

- Define principals as users and groups.
- Start with explicit permissions such as `VIEW`, `SUBMIT`, `RELEASE_OWN`, `RELEASE_ANY`, and `MANAGE`.
- Establish deny and allow precedence before writing the evaluator. A simple model with additive allows and no explicit deny is easier to audit for the first release.
- Define administrator bypass behavior.
- Check ACLs on the server for every printer and job operation. Hiding a button is not authorization.
- Provide an explanation endpoint or admin view showing why a user has access.
- Test direct membership, group membership, missing permissions, suspended users, and administrator behavior.

### Audit and reporting

- Record login success and failure, logout, account changes, password resets, group changes, ACL changes, settings changes, job submissions, releases, cancellations, failures, and quota adjustments.
- Add request IDs and source IP addresses where collection is appropriate.
- Keep passwords, session identifiers, OIDC tokens, and document contents out of audit details.
- Add an admin audit viewer with filtering and pagination.
- Build usage reports by user, group, printer, date range, color mode, and status.
- Add CSV export with a documented time zone and column format.
- Decide how long audit and reporting data is retained.
- Add cost totals and estimated savings to reports, but label estimates clearly and keep the underlying rate version available for audit.
- Add exact lookup by job trace ID and, if document signatures are implemented later, by printed signature.

### Document privacy

- Treat filenames, page thumbnails, and previews as document metadata with separate permissions from ordinary job-list access.
- Keep preview generation disabled by default. If enabled later, generate thumbnails in a sandbox, encrypt them at rest, apply the job's expiry, and never place them in shared caches or logs.
- Document watermarking and traceable printed signatures are post-0.2 candidates. If implemented, use a tested PDF transformation pipeline that preserves the original, records the transformation version, and supports user, time, job, printer, and opaque trace-ID variables.

## Release 0.2: CUPS and print-node integration

### Container layout

- Add a dedicated CUPS service. Do not install CUPS in the web or PostgreSQL container.
- Add a small print-node service that owns CUPS communication, USB discovery, and job status reporting.
- Keep the Spring API as the control plane and the print node as the machine-facing worker.
- Put CUPS and the print node on an internal Compose network.
- Expose the CUPS administration port only when an administrator intentionally enables it.
- Use separate persistent volumes for CUPS configuration, printer drivers or PPDs where unavoidable, spool state, and printLe job files.
- Add explicit health checks for CUPS readiness and print-node connectivity.
- Make shutdown drain or safely interrupt active jobs.

### CUPS administration

- Generate a strong CUPS administrator password during first installation.
- Store the generated secret in a root-readable Docker secret or protected data volume, not in logs or frontend responses.
- Provide a printLe command or protected administrator flow to rotate the CUPS password.
- Do not show the CUPS password in the normal web interface.
- Prefer management through the print-node API instead of exposing raw CUPS administration.
- Restrict CUPS configuration to the internal network by default.
- Add backup and restore instructions for the CUPS volume.

### USB discovery and stable matching

- Enumerate printers with udev and libusb data rather than relying on a hardcoded `/dev/bus/usb/BBB/DDD` path.
- Record vendor ID, product ID, manufacturer, product name, USB serial number, IEEE 1284 device ID when available, and the current device path.
- Use a stable matching hierarchy: configured serial number first, IEEE 1284 device ID second, then vendor/product plus an administrator-approved discriminator.
- Treat the output of `lsusb` as discovery information. The bus and device numbers may change after a reboot or reconnect.
- If two identical printers have no unique serial or device ID, require an administrator to identify a physical port or confirm the match. Never choose silently.
- Create udev rules or stable symlinks when the host supports them.
- Pass only required USB devices into the print-node container where possible. Avoid `privileged: true` as the default.
- Detect disconnects and reconnects without restarting the whole stack.
- Show ambiguous, missing, permission-denied, and driver-missing states in the admin UI.
- Test printer reconnects, host reboots, container restarts, changed USB numbering, and two identical devices.

### Printer capability and driver management

- Prefer driverless IPP Everywhere printers when supported.
- Define how legacy drivers and PPD files are installed, trusted, backed up, and upgraded.
- Query capabilities from CUPS and expose only supported user options.
- Map printLe color and duplex values to CUPS options in one tested adapter: `MONOCHROME` → `print-color-mode=monochrome`, hardware duplex → `sides=two-sided-long-edge` or `two-sided-short-edge`.
- Manual duplex must not send CUPS `sides`. Split the PDF into odd and even jobs and run them as two CUPS submissions with a confirmed flip between them.
- Refuse hardware duplex when the printer has no duplex capability. Still allow manual duplex on those printers.
- Refuse a forced-grayscale job if the printer cannot honor monochrome, rather than printing color.
- Add media size, tray, orientation, scaling, page range, and finishing options only after capability negotiation works. Page range, when added, must compose with manual duplex as defined under Print options.
- Add a test-page action restricted to administrators.
- Surface CUPS errors in plain language while preserving technical details for logs.
- Poll consumable levels and normalized printer reasons where supported. Surface stale or unsupported telemetry honestly; never infer a healthy printer from missing data.
- Add threshold-based low-toner and persistent-fault notifications only after outbound email exists, with deduplication, recovery notices, and per-printer suppression.

### Job delivery

- Transfer an authorized held PDF to the print node over an authenticated internal channel.
- Give each submission an idempotency key so retries cannot create duplicate physical prints.
- Record the CUPS job ID and correlate it with the printLe job ID.
- Poll or subscribe to CUPS state until completion or terminal failure.
- Update quota only from confirmed lifecycle transitions.
- Handle print-node restarts and lost acknowledgements without duplicating jobs.
- Limit concurrency per printer and apply backpressure when the spool is full.
- Add job release from the web interface after the end-to-end path is reliable.
- Recheck the selected printer immediately before release. Apply the configured allow/warn/block error policy, and make an acknowledged warning part of the audit trail.

### CUPS upgrade safety

- Pin CUPS and base-image versions. Do not use floating `latest` tags.
- Track image digests or use a controlled dependency-update process.
- Run a compatibility suite before accepting CUPS image updates.
- Test startup, printer enumeration, capability lookup, a sample PDF job, cancellation, and persisted configuration across upgrades.
- Back up CUPS configuration before migrations.
- Document supported CUPS versions and provide a rollback procedure.
- Keep the print-node adapter narrow so CUPS changes do not leak throughout the Java application.

Existing CUPS and Avahi container projects can inform entrypoint design, permissions, udev handling, volume layout, health checks, and signal handling. Their images and scripts must still be reviewed for maintenance status, security practices, architecture support, and license compatibility before reuse. Avahi is not required while AirPrint and network printer discovery remain out of scope.

## Release 0.3: authentication and enterprise controls

### Local authentication

- Add password change, password reset, recovery codes, and configurable password policy.
- Add rate limiting and progressive delays for failed logins.
- Rotate the session ID at login and privilege changes.
- Add idle and absolute session expiration.
- Let administrators revoke a user's sessions.
- Record authentication events without logging credentials.
- Decide whether local multi-factor authentication belongs in printLe or should be delegated to an identity provider.

### Optional OIDC SSO

- Implement standards-based OpenID Connect instead of an Authentik-specific protocol.
- Keep local authentication available unless an administrator deliberately disables it.
- Provide a protected break-glass local administrator account when SSO is required.
- Support Authentik first. Its local users, external identity sources, MFA, and branded login flows stay in Authentik.
- Add discovery URL, client ID, client secret, scopes, claim mappings, logout behavior, and callback URL settings.
- Store client secrets encrypted at rest or through Docker secrets.
- Support just-in-time user creation as an explicit option.
- Map groups or claims to printLe roles with a safe default of `USER`.
- Never promote an account to `ADMIN` because of a missing or malformed claim.
- Decide how local and SSO accounts with the same email are linked.
- Test provider outage, revoked users, changed email addresses, group removal, key rotation, and clock skew.
- Consider SAML and WorkOS only after OIDC is stable and there is real customer demand.

### Branding

- Add organization name, logo, favicon, accent color, support contact, and login-page copy.
- Keep printLe attribution rules consistent with the final license.
- For Authentik-hosted login pages, document which branding is configured in Authentik rather than printLe.
- Sanitize uploaded logos and constrain file type and size.

### Enterprise-only candidates

Features that may fit a paid enterprise edition include:

- SAML and managed directory integrations
- SCIM provisioning and deprovisioning
- Multiple identity providers and domain-based routing
- High availability and multiple print nodes
- Central fleet management
- Advanced audit retention and SIEM export
- Custom retention policies and compliance controls
- Priority support and supported upgrade channels

Do not put fundamental security fixes, backups, or basic local administration behind a paid tier.

## Settings that need real implementations

The Settings page should eventually contain:

- Organization identity and branding
- Default monthly quota and quota reset time zone
- Maximum upload size and job retention periods
- Allowed document formats, initially PDF only
- Default print options
- Local password policy and session lifetime
- OIDC provider configuration and claim mappings
- SMTP configuration for invitations and recovery mail
- Audit retention and export settings
- Print-node enrollment and health
- CUPS connection status without exposing raw credentials
- Storage usage, backup status, and cleanup controls
- Application version, database migration version, CUPS version, and diagnostic bundle export

Every setting needs validation, authorization, an audit record, and a documented default. Secrets require separate storage and masked display.

## Operations and installation

### Compose distribution

- Add production and development Compose profiles without duplicating configuration unnecessarily.
- Pin every container image.
- Add CPU, memory, PID, and log-rotation limits.
- Run services as non-root wherever practical.
- Use read-only root filesystems and drop Linux capabilities where the service permits it.
- Add Docker secrets support while retaining a simple `.env` path for local evaluation.
- Add an installation command that generates all required secrets.
- Validate configuration before starting containers.
- Add upgrade, rollback, uninstall, backup, and restore commands.
- Preserve PostgreSQL data, job files, CUPS data, and secrets during ordinary upgrades.

### Networking and HTTPS

- Keep PostgreSQL, the Java API, CUPS, and print-node ports off the host network by default.
- Publish only the web entrypoint.
- Support a reverse proxy with trusted forwarded headers.
- Document HTTPS setup for Caddy, Traefik, and nginx.
- Set secure cookies automatically when the public URL uses HTTPS.
- Add an explicit list of trusted origins and proxy networks.
- Document LAN-only deployment risks. A private network is not automatically trusted.
- Consider an optional `.local` hostname only if mDNS is added for the web service. This is separate from AirPrint.

### Backups and recovery

- Create an application-consistent backup process for PostgreSQL, uploaded jobs, CUPS state, and secrets.
- Encrypt backups that leave the machine.
- Add restore verification and a documented disaster-recovery drill.
- Warn when job records and stored PDFs are restored from different points in time.
- Add storage monitoring and a safe response when disk space runs low.

### Observability

- Add structured JSON logs with request and job correlation IDs.
- Add readiness and liveness checks that test the right dependencies.
- Export metrics for queue depth, job duration, failures, printer availability, disk usage, login failures, and database health.
- Add optional OpenTelemetry support.
- Provide an administrator diagnostic bundle with secrets and document contents removed.
- Add alerts for an unavailable printer, repeated job failures, a full disk, failed backups, and migration errors.

## Security work

- Write a threat model covering malicious PDFs, stolen sessions, unauthorized printer use, quota bypass, compromised print nodes, USB access, and exposed CUPS administration.
- Run PDF parsing in a constrained process with memory and time limits.
- Consider malware scanning as an optional deployment feature.
- Set Content Security Policy, frame restrictions, MIME sniffing protection, referrer policy, and sensible permissions policy headers.
- Add server-side request size limits at nginx and Spring.
- Rate-limit login, upload, job creation, and expensive admin endpoints.
- Verify authorization on every object lookup to prevent cross-user job access.
- Encrypt or otherwise protect stored documents according to the deployment threat model.
- Never put passwords or identity-provider secrets in Git, images, logs, or browser bundles.
- Generate a software bill of materials and scan images and dependencies in CI.
- Define a vulnerability disclosure and supported-version policy before selling the product.

## Testing and release gates

### Automated tests

- Unit-test quota rules, ACL evaluation, job transitions, identity mapping, and USB matching.
- Add backend integration tests against PostgreSQL, not only an in-memory substitute.
- Test migrations from every supported release.
- Add API contract tests between the React client and Spring controllers.
- Add browser tests for user and administrator workflows.
- Add Compose smoke tests that start the real stack and verify login, upload, cancellation, persistence, and restart behavior.
- Add print-node tests with recorded CUPS responses and USB fixtures.
- Keep a small hardware compatibility lab before claiming support for specific printers.

### Release checklist

A release is not ready until:

- Backend tests, frontend tests, browser tests, and Compose smoke tests pass.
- Dependency and image scans have no unresolved critical findings.
- Database and CUPS migrations have rollback or recovery instructions.
- Backup and restore have been exercised on the release candidate.
- A fresh install and an upgrade from the previous supported release both work.
- User-facing changes and known limitations are documented.
- Versioned images are published for supported CPU architectures.

## Licensing and commercial work

- Choose the open-source or source-available license before accepting external contributions.
- Review the licenses of CUPS, printer drivers, container images, frontend packages, and any copied entrypoint scripts.
- Decide whether printLe uses an open-core model, a commercial license, paid support, or hosted fleet management.
- Keep paid entitlement checks out of the physical print path so a licensing outage cannot strand a customer's printer.
- Define offline licensing if enterprise deployments may be isolated from the internet.
- Add contributor terms only after the commercialization model is clear.
- Have counsel review trademark, privacy, third-party notices, and enterprise terms before charging customers.

## Explicitly deferred

These items are not part of the current plan unless the scope changes:

- AirPrint advertising through Avahi
- Native operating-system printer installation
- Standard `Ctrl+P` printing from desktop applications
- Mobile applications
- Native desktop/mobile print clients, offline submission, and endpoint-management deployment packages
- Distributed edge-node meshes, super nodes, remote-site routing, and multi-site high availability
- Embedded multifunction-printer apps, badge/card readers, access codes, and scan-to-email/folder/fax workflows
- Integrated scanning and scan capture-field workflows
- Non-PDF document conversion
- Cloud-hosted document processing

Leaving these out keeps the first useful product focused: submit a PDF in the browser, enforce access and quotas, and deliver it reliably through a self-contained print node.

## Recommended build order

1. ~~Add printer records, capability lookup, ACL enforcement, and queue selection at release.~~ Implemented against the mock fleet.
2. Harden print-node recovery and add stable udev/libusb matching for physical USB devices.
3. ~~Add CUPS cancellation/retry and exercise mock failure queues.~~ Implemented; retain this as a Compose regression gate.
4. ~~Add administrator quota adjustments and expose quota/retention settings in the UI.~~ Implemented.
5. Harden local authentication, then add optional Authentik-compatible OIDC.
6. ~~Add reporting, backups, diagnostics, and baseline browser security headers.~~ Implemented; upgrade tooling and deeper observability remain.
7. Run hardware and upgrade testing before calling the project production-ready.
8. Settle licensing and package enterprise features only after the core print path is dependable.
