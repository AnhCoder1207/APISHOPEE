create schema if not exists camlink;

create table if not exists camlink.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists camlink.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references camlink.users(id),
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'business')),
  monthly_quota integer not null default 2000 check (monthly_quota >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists camlink.workspace_members (
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  user_id uuid not null references camlink.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists camlink.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references camlink.users(id) on delete cascade,
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  token_hash text not null unique,
  ip_hash text,
  user_agent text,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists camlink.shopee_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  created_by uuid not null references camlink.users(id),
  name text not null,
  encrypted_cookie text not null,
  status text not null default 'connected' check (status in ('connected', 'expired', 'error')),
  is_default boolean not null default false,
  affiliate_id text,
  affiliate_name text,
  last_checked_at timestamptz,
  last_error_code text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shopee_connections_one_default
  on camlink.shopee_connections(workspace_id)
  where is_default = true and deleted_at is null;
create index if not exists shopee_connections_workspace_idx
  on camlink.shopee_connections(workspace_id, created_at desc)
  where deleted_at is null;

create table if not exists camlink.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  created_by uuid not null references camlink.users(id),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_workspace_idx
  on camlink.api_keys(workspace_id, created_at desc)
  where revoked_at is null;

create table if not exists camlink.link_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  user_id uuid not null references camlink.users(id),
  shopee_connection_id uuid not null references camlink.shopee_connections(id),
  sub_id_1 text not null default '',
  sub_id_2 text not null default '',
  sub_id_3 text not null default '',
  sub_id_4 text not null default '',
  sub_id_5 text not null default '',
  item_count integer not null,
  created_at timestamptz not null default now()
);

create table if not exists camlink.link_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references camlink.link_batches(id) on delete cascade,
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  original_link text not null,
  short_link text,
  long_link text,
  fail_code integer not null default -1,
  created_at timestamptz not null default now()
);

create index if not exists link_results_workspace_idx
  on camlink.link_results(workspace_id, created_at desc);

create table if not exists camlink.conversion_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  shopee_connection_id uuid not null references camlink.shopee_connections(id),
  checkout_id text not null,
  purchase_time timestamptz not null,
  conversion_status integer not null,
  source text not null default '',
  order_count integer not null default 0,
  order_value_internal numeric(30, 0) not null default 0,
  estimated_commission_internal numeric(30, 0) not null default 0,
  payload jsonb not null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (shopee_connection_id, checkout_id)
);

create index if not exists conversion_records_workspace_time_idx
  on camlink.conversion_records(workspace_id, purchase_time desc);

create table if not exists camlink.usage_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references camlink.workspaces(id) on delete cascade,
  user_id uuid not null references camlink.users(id),
  api_key_id uuid references camlink.api_keys(id) on delete set null,
  event_type text not null,
  status_code integer not null,
  billable boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_workspace_month_idx
  on camlink.usage_events(workspace_id, created_at desc)
  where billable = true;

create table if not exists camlink.auth_rate_limits (
  key_hash text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

revoke all on schema camlink from public;

