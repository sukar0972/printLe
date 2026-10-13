create table app_user (
    id uuid primary key,
    email varchar(320) not null unique,
    display_name varchar(120) not null,
    password_hash varchar(255) not null,
    role varchar(20) not null,
    status varchar(20) not null,
    monthly_page_quota integer,
    quota_exempt boolean not null default false,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null
);
create table user_group (
    id uuid primary key,
    name varchar(120) not null unique,
    monthly_page_quota integer,
    built_in boolean not null default false,
    created_at timestamp with time zone not null
);
create table group_member (
    group_id uuid not null references user_group(id) on delete cascade,
    user_id uuid not null references app_user(id) on delete cascade,
    primary key (group_id, user_id)
);
create table printer (
    id uuid primary key,
    name varchar(120) not null,
    description varchar(500),
    status varchar(20) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null
);
create table printer_acl (
    id uuid primary key,
    printer_id uuid not null references printer(id) on delete cascade,
    principal_type varchar(20) not null,
    principal_id uuid not null,
    permission varchar(30) not null,
    unique (printer_id, principal_type, principal_id, permission)
);
create table print_job (
    id uuid primary key,
    owner_id uuid not null references app_user(id),
    original_filename varchar(255) not null,
    storage_key varchar(255) not null unique,
    content_type varchar(100) not null,
    size_bytes bigint not null,
    pages integer not null,
    copies integer not null,
    color_mode varchar(20) not null,
    duplex_mode varchar(30) not null,
    status varchar(30) not null,
    printer_id uuid references printer(id),
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null
);
create index idx_print_job_owner_created on print_job(owner_id, created_at desc);
create table quota_ledger (
    id uuid primary key,
    user_id uuid not null references app_user(id),
    job_id uuid references print_job(id),
    pages integer not null,
    entry_type varchar(20) not null,
    note varchar(255),
    created_at timestamp with time zone not null
);
create index idx_quota_ledger_user_created on quota_ledger(user_id, created_at);
create table audit_event (
    id uuid primary key,
    actor_id uuid references app_user(id),
    action varchar(80) not null,
    target_type varchar(40) not null,
    target_id varchar(80),
    details text,
    created_at timestamp with time zone not null
);
create index idx_audit_event_created on audit_event(created_at desc);

