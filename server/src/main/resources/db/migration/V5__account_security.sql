alter table app_user add column password_change_required boolean not null default false;
alter table app_user add column last_signed_in_at timestamp with time zone;
