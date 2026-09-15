<h1 align="center">
  <img src="web/public/printle-logo.svg" alt="printLe" width="320">
</h1>

printLe is a self-hosted web print queue. Users upload PDFs, manage held jobs, and track their monthly page allowance. Administrators manage accounts, roles, quotas, and printer records from the same web interface.

This repository is a fresh rewrite. The previous Node implementation is preserved in the `legacy-v1.0` tag. `docs/legacy-v1.0.md` records what that version actually did, which bugs later commits fixed, and which behaviors must not return.

## Current scope

The current build includes:

- Local email and password authentication with Argon2id password hashes
- Secure server-side browser sessions and CSRF protection
- `ADMIN`, `OPERATOR`, `MANAGER`, and `USER` roles
- User and group administration, suspension, password resets, quota overrides, and adjustments
- PDF validation, page counting, held-job storage, cancellation, retry, and expiry
- IPP job states, idempotent delivery, hardware duplex, and two-stage manual duplex
- Direct IPP printer registration, capability-aware release, maintenance/error policy, and printer ACLs
- Monthly page allowances with individual/group/default precedence and transactional accounting
- Immutable per-job price estimates with versioned monochrome and color printer rates
- Usage reports and CSV export
- Append-only audit records for authentication, administration, and print operations
- PostgreSQL migrations with Flyway
- A responsive React interface with light/dark/system themes and selectable local fonts
- Configurable print/retention policy and dependency diagnostics
- Application-consistent backup tooling for PostgreSQL and job files
- Backend and frontend integration tests
- Production and development Docker Compose definitions with health checks and persistent service volumes

Hardware validation, stable udev/libusb enrollment, QR release, external OIDC, email invitations, and production hardening remain on the roadmap.

## Run with Docker Compose

Install Docker Engine with Docker Compose, then create the local configuration:

```bash
cp .env.example .env
```

Edit `.env` and replace both placeholder passwords. Start the application:

```bash
docker compose up -d --build
```

Open [http://localhost:8080](http://localhost:8080) and sign in with the bootstrap administrator configured in `.env`.

The bootstrap administrator is created only when the user table is empty. Changing its environment variables later does not change the existing account.

## Development

Run the frontend locally:

```bash
cd web
npm install
npm run dev
```

Run backend tests with Java 21, a running Docker daemon, and the included Maven wrapper:

```bash
cd server
./mvnw test
```

Backend integration tests use Testcontainers to start disposable PostgreSQL 17
databases. They run the production Flyway migrations and validate the schema with
Hibernate. The suite also tests upgrading existing job and quota data. No running
Compose stack or manually created test database is needed; the first run downloads
the PostgreSQL and Testcontainers helper images. Tests fail if Docker is unavailable.

Spring manages each test database for the lifetime of its application context and
removes it when that context closes. Maven limits the context cache to two entries
to bound container usage. Run these commands on the Docker host; running them inside
the application container requires separate access to a Docker daemon and its
published container ports. CI runs the same tests on the GitHub-hosted Ubuntu runner.
New Spring integration tests should import `PostgresTestConfiguration` to receive
the managed database connection.

Run the frontend checks:

```bash
cd web
npm test
npm run build
```

## Fake Printer

Administrators can open **Manage → Fake Printer** to run a mock IPP printer inside
the backend. Enable it, copy its IPP address, then use **Printers → Add IPP printer**
to register it. The address uses the backend's loopback interface, so it also works
when the backend runs in Docker. No additional container or physical printer is
required.

Upload a PDF in **Print queue** and release it to that printer. Return to
**Fake Printer** to see discovery, Create-Job, Send-Document, status polls, and
cancellation, including decoded request/response attributes and IPP status codes.
The received-job view shows the submitted options, PDF page count, byte count,
and SHA-256 checksum. PDF contents are discarded after inspection.

Jobs remain processing until you choose **Complete**, **Fail**, **Stop**, or
**Cancel at printer**. You can also cancel through Print queue to verify the
outgoing Cancel-Job operation. printLe observes the new state on its next backend
poll; refresh the queue view to see it. The mock also supports Print-Job,
Validate-Job, and Get-Jobs. It simulates IPP delivery and job states, not physical
rendering, paper handling, or full printer conformance.

The simulator starts disabled. Controls and logs require an administrator session;
IPP requests use an unguessable address without a browser login. It retains the
last 200 actions and up to 100 jobs in memory, evicting finished jobs as needed.
Clearing the log leaves jobs intact. Restarting the backend disables the simulator,
clears its history, and changes its address; finish test jobs first and register
the new address after restarting.

## Data

Compose stores PostgreSQL data and uploaded PDFs in named volumes. Uploaded files are accepted only when they have a PDF header and can be parsed by PDFBox. The default upload limit is 25 MB.

Back up the database and job files together. See [`docs/backup-and-restore.md`](docs/backup-and-restore.md).

## Security notes

- Do not expose the development configuration to the internet.
- Put production deployments behind HTTPS and set `PRINTLE_SECURE_COOKIES=true`.
- Replace every placeholder secret in `.env`.
- The web service is the only published container. PostgreSQL and the API stay on an internal Compose network.
- There is no public registration endpoint.

The project license is still undecided. Do not accept outside contributions until the community and commercial licensing model is settled.

### IPP printers

In Printers, choose Add IPP printer and enter the printer's `ipp://` or `ipps://`
endpoint. The printer must accept PDF documents. The backend connects directly;
CUPS, USB passthrough, and the Python print-node are no longer part of the stack.

The upload form accepts page ranges such as `1-3, 5`; leave Pages blank to print
all pages. Quotas count the selected pages multiplied by the number of copies.
Manual duplex prints odd pages first, waits for you to reload the stack, then
prints even pages. The confirmation offers reverse order for printers that need it.

IPPS verifies certificates. Printer authentication and document conversion are
not supported. An empty printer ACL permits all users; configure the policy to
restrict access. Unconfirmed submissions are not automatically sent again.

Run `docker compose up -d --build` for the IPP-only stack. When upgrading,
previously registered CUPS-only printers are disabled and need IPP registration.
Historical job IDs are retained. Active legacy jobs are marked unconfirmed and
must be checked on their original printer.
