alter table camlink.users
  add column if not exists is_admin boolean not null default false;

alter table camlink.workspaces
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspaces_status_check'
      and conrelid = 'camlink.workspaces'::regclass
  ) then
    alter table camlink.workspaces
      add constraint workspaces_status_check check (status in ('active', 'suspended'));
  end if;
end
$$;

create table if not exists camlink.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references camlink.users(id) on delete set null,
  actor_email text not null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on camlink.admin_audit_logs(created_at desc);

create index if not exists users_admin_idx
  on camlink.users(is_admin)
  where is_admin = true;

create index if not exists workspaces_status_idx
  on camlink.workspaces(status, created_at desc);

revoke all on table camlink.admin_audit_logs from public;
