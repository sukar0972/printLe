# Backup and restore

Back up the database and held-job files together.

Run `scripts/backup.sh /absolute/path/to/an/empty/directory`. It stops the API,
exports PostgreSQL with `pg_dump`, copies job files, and restarts the API.
Printers may continue processing jobs already submitted to them.

To restore, use a fresh deployment running the same application version:

1. Stop `server`.
2. Restore `database.dump` with `pg_restore --clean --if-exists --no-owner` into the `printle` database.
3. Replace the `job_data` volume contents with the backup's `jobs` directory.
4. Start `server`, check Settings diagnostics, and run a test print.

Validate restores in disposable volumes first. Keep the database and job files
from the same backup. CUPS state is no longer part of a printLe backup.
