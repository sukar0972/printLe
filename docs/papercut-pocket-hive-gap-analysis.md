# PaperCut Pocket/Hive benchmark for printLe

Captured from the [PaperCut Pocket and Hive manual](https://www.papercut.com/help/manuals/pocket-hive/) on 2026-09-02. This is a product-gap benchmark, not a requirement to clone PaperCut. printLe remains a self-hosted web print queue; features that require endpoint agents, a distributed edge mesh, or embedded MFD applications are outside the current architecture.

## Add to the core roadmap

| Capability observed in the manual | Existing printLe coverage | Required addition |
| --- | --- | --- |
| Held-job timeout and automatic deletion | Retention and cleanup were planned generically | Snapshot `expires_at` per job, transition idempotently to `EXPIRED`, release reserved quota, and delete the payload. Setting changes affect new jobs only. |
| Printer-error warnings and release blocking | Printer status exists, but no release-time policy is defined | Normalize common IPP/CUPS faults and add `ALLOW` / `WARN` / `BLOCK`, custom guidance, a fresh pre-release check, and audit of warning acknowledgement. |
| Print tracking and diagnostic job trace | Audit/reporting and CUPS job IDs are planned | Add one searchable trace ID across API, print node, CUPS, status transitions, and audit events, exposed as an admin-safe timeline. |
| Quotas, restrictions, and cost tracking | Monthly page quotas are partly built | Keep allowance, restrictions, and money as distinct concepts. Add preflight restrictions plus versioned printer rates and immutable per-job cost snapshots. |
| Printer supplies and low-toner alerts | Capability/status polling is planned | Model telemetry freshness and unsupported states; later add deduplicated threshold notifications after outbound email exists. |
| Bulk user administration | UI pagination/search and invitations are planned | Add CSV dry run, validation, duplicate policy, row errors, transactional application, and auditing. |
| Thumbnail privacy | No explicit preview policy | Make preview permission separate from job-list permission; default previews off and bind derived files to encryption and job retention. |
| Watermarks and traceable printed signatures | Not planned | Keep post-0.2, but reserve an opaque trace-ID lookup and require a versioned, auditable transformation pipeline if adopted. |

These additions are incorporated into `ROADMAP.md` in the sections where they must be designed, implemented, and tested.

## Already covered

The current roadmap already accounts for held jobs and secure web release, groups, printer ACLs, quotas, forced monochrome, hardware and manual duplex, capability negotiation, printer/job reporting, automatic cleanup, optional OIDC, custom branding, CUPS delivery, idempotency, and diagnostic bundles. Those items need implementation, not duplicate requirements.

## Deliberately deferred

The manual also describes native desktop/mobile printing, offline printing, endpoint bulk deployment, edge/super-node meshes, remote and multi-site delivery, badge/card release, embedded MFD apps, and integrated scanning. They imply new trusted clients, hardware integrations, or distributed-system boundaries. Most remain under `Explicitly deferred`; Scan to Email is recorded separately as a distant post-1.0 possibility rather than part of the active release plan.

## Source pages used for detailed requirements

- [Automatic job timeout and deletion](https://www.papercut.com/help/manuals/pocket-hive/overview/print-security/about-deleting-print-jobs-automatically/)
- [Printer-error alerts and release blocking](https://www.papercut.com/help/manuals/pocket-hive/overview/print-security/about-alerting-users-to-printer-errors/)
- [Watermarks and digital signatures](https://www.papercut.com/help/manuals/pocket-hive/overview/print-security/watermarks-digital-signatures/)
- [Configure features index](https://www.papercut.com/help/manuals/pocket-hive/configure-features/)
- [Manage the print environment index](https://www.papercut.com/help/manuals/pocket-hive/manage-your-print-environment/)
- [Troubleshooting index](https://www.papercut.com/help/manuals/pocket-hive/troubleshooting/)
