# printLe

printLe is a self-hosted web print queue. Users upload PDFs, manage held jobs, and track their monthly page allowance. Administrators manage accounts, roles, quotas, and printer records from the same web interface.

This repository is a fresh rewrite. The previous Node implementation is preserved in the `legacy-v1.0` tag. `docs/legacy-v1.0.md` records what that version actually did, which bugs later commits fixed, and which behaviors must not return.

## Current scope

The current build includes:

- Local email and password authentication with Argon2id password hashes
- Secure server-side browser sessions and CSRF protection
- `ADMIN`, `OPERATOR`, `MANAGER`, and `USER` roles
- Admin user creation, a suspension-ready account model, and quota overrides
- PDF validation, page counting, held-job storage, and cancellation
- Monthly page allowances and pending-page accounting
- Printer and ACL-ready database tables
- Append-only audit records for important actions
- PostgreSQL migrations with Flyway
- A responsive React interface
- Backend and frontend integration tests
- Production Dockerfiles and Docker Compose

CUPS, QR release, external OIDC, WorkOS, Authentik, email invitations, and actual printer delivery are intentionally not implemented yet.

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

Run backend tests with the included Maven wrapper:

```bash
cd server
./mvnw test
```

Run the frontend checks:

```bash
cd web
npm test
npm run build
```

## Data

Compose stores PostgreSQL data and uploaded PDFs in named volumes. Uploaded files are accepted only when they have a PDF header and can be parsed by PDFBox. The default upload limit is 25 MB.

Back up `postgres_data` and `job_data` together. Database records and stored PDFs must remain consistent.

## Security notes

- Do not expose the development configuration to the internet.
- Put production deployments behind HTTPS and set `PRINTLE_SECURE_COOKIES=true`.
- Replace every placeholder secret in `.env`.
- The web service is the only published container. PostgreSQL and the API stay on an internal Compose network.
- There is no public registration endpoint.

The project license is still undecided. Do not accept outside contributions until the community and commercial licensing model is settled.
