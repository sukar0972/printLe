# Backup and restore

The database, held-job files, and CUPS configuration are one consistency unit. Back them up together.

Run `scripts/backup.sh /absolute/path/to/an/empty/directory`. The script briefly stops the API, print node, and CUPS while PostgreSQL remains available for `pg_dump`, copies all three data sets, and then restarts printing.

To restore, use a fresh printLe deployment running the same application version:

1. Stop `server`, `print-node`, and `cups`.
2. Restore `database.dump` with `pg_restore --clean --if-exists --no-owner` into the `printle` database.
3. Replace the contents of the `job_data` volume with the backup's `jobs` directory.
4. Replace the contents of the `cups_config` volume with the backup's `cups` directory.
5. Start `cups`, `print-node`, and `server`, then run the Settings diagnostics and a test print.

Restore into disposable volumes first when validating a backup. Never mix a database from one backup with job files or CUPS configuration from another.
