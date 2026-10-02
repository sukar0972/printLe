alter table print_job add column expires_at timestamp with time zone;
update print_job set expires_at = created_at + interval '24 hours' where status = 'HELD';

create unique index uq_quota_ledger_job_type on quota_ledger(job_id, entry_type);

insert into quota_ledger (id, user_id, job_id, pages, entry_type, note, created_at)
select gen_random_uuid(), owner_id, id, pages * copies, 'RESERVE', 'Backfilled reservation', created_at
from print_job;

insert into quota_ledger (id, user_id, job_id, pages, entry_type, note, created_at)
select gen_random_uuid(), owner_id, id, pages * copies, 'RELEASE', 'Backfilled settlement', coalesce(completed_at, updated_at)
from print_job where status in ('COMPLETED', 'CANCELED', 'ABORTED', 'EXPIRED');

insert into quota_ledger (id, user_id, job_id, pages, entry_type, note, created_at)
select gen_random_uuid(), owner_id, id, pages * copies, 'DEBIT', 'Backfilled completion', coalesce(completed_at, updated_at)
from print_job where status = 'COMPLETED';

alter table quota_ledger drop constraint quota_ledger_job_id_fkey;
alter table quota_ledger add constraint quota_ledger_job_id_fkey foreign key (job_id) references print_job(id) on delete set null;

create index idx_print_job_held_expiry on print_job(status, expires_at);
create index idx_print_job_terminal_retention on print_job(status, completed_at);
