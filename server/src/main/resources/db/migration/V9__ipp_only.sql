-- Keep historical migrations and queue columns intact for existing installations.
-- Rename remote IDs without changing their values or losing job history.
alter table print_job rename column cups_job_id to ipp_job_id;
alter table print_job rename column odd_cups_job_id to odd_ipp_job_id;
alter table print_job rename column even_cups_job_id to even_ipp_job_id;
update printer set enabled = false, status = 'UNCONFIGURED',
    state_reasons = 'IPP enrollment required; legacy transport removed'
    where ipp_uri is null;
-- A removed transport cannot confirm the outcome of previously submitted jobs.
update print_job set status = 'SUBMISSION_UNKNOWN',
    ipp_state_reasons = 'Legacy transport removed; reconcile the job on its original printer'
    where ipp_uri is null and status in ('PENDING', 'PENDING_HELD', 'PROCESSING', 'PROCESSING_STOPPED', 'AWAITING_FLIP');
