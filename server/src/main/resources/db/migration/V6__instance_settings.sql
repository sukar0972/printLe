create table instance_settings (
    id integer primary key,
    default_monthly_page_quota integer not null,
    quota_timezone varchar(80) not null,
    held_job_ttl_hours integer not null,
    completed_retention_hours integer not null,
    failed_retention_hours integer not null,
    max_copies integer not null,
    max_pages_per_job integer not null,
    color_printing_allowed boolean not null,
    updated_at timestamp with time zone not null
);
