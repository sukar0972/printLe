alter table print_job add column submission_key uuid;
alter table print_job add column cups_job_id integer;
alter table print_job add column cups_queue varchar(127);
alter table print_job add column ipp_state_reasons varchar(1000);
alter table print_job add column submitted_at timestamp with time zone;
alter table print_job add column completed_at timestamp with time zone;

update print_job set status = 'PENDING' where status = 'RELEASE_QUEUED';
update print_job set status = 'PROCESSING' where status = 'PRINTING';
update print_job set status = 'ABORTED' where status = 'FAILED';
update print_job set status = 'CANCELED' where status = 'CANCELLED';

create unique index uq_print_job_submission_key on print_job(submission_key);
create index idx_print_job_cups_active on print_job(cups_job_id, status);
