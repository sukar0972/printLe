# printLe

## Stack

- `web/`: React, TypeScript, Vite, Tailwind CSS v4, shadcn/Radix UI, Lucide icons, and TanStack Table. Keep the frontend lean.
- `server/`: Java 21, Spring Boot 3, Maven, Spring Security, JPA, PostgreSQL, and Flyway migrations.
- Docker Compose runs the web app, backend, and PostgreSQL.

## Printers

Printers connect over IPP (`ipp://`) or encrypted IPPS (`ipps://`). The backend connects directly to PDF-capable IPP printers. CUPS and the Python print-node are no longer used.

## Checks

- Run `npm --prefix web run lint` after frontend changes. It uses Oxlint with `@shadcn/lint` rules in `web/.oxlintrc.json`.
- `npm --prefix web run build` checks TypeScript and builds the app. `npm --prefix web test` runs Vitest.
- Run `mvn -f server/pom.xml verify` for backend checks. No dedicated Java or Python linter is configured.
