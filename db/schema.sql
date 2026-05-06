create extension if not exists postgis;

create table if not exists risk_score_current (
  cell_id text primary key,
  gu_name text not null,
  score numeric(5,4) not null check (score >= 0 and score <= 1),
  level text not null check (level in ('SAFE','LOW','MEDIUM','HIGH')),
  center geography(Point, 4326) not null,
  bbox geometry(Polygon, 4326) not null,
  inputs jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists risk_score_current_bbox_gix on risk_score_current using gist (bbox);
create index if not exists risk_score_current_level_score_idx on risk_score_current (level, score desc);

create table if not exists risk_score_archive (
  id bigserial primary key,
  cell_id text not null,
  gu_name text not null,
  score numeric(5,4) not null,
  level text not null,
  inputs jsonb not null,
  source text not null default 'p8_deferred',
  created_at timestamptz not null default now()
);

create table if not exists external_snapshots (
  id bigserial primary key,
  provider text not null,
  endpoint text not null,
  fetched_at timestamptz not null default now(),
  valid_at timestamptz,
  payload jsonb not null
);
create index if not exists external_snapshots_provider_time_idx on external_snapshots (provider, fetched_at desc);

create table if not exists api_ingest_health (
  provider text primary key,
  status text not null check (status in ('ok','degraded','error')),
  last_success_at timestamptz,
  failure_count_1h int not null default 0,
  message text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists citizen_reports (
  id uuid primary key,
  gu_name text not null,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  depth_step text not null check (depth_step in ('ankle','knee','thigh','above')),
  mobility_block text[] not null default '{}',
  memo text,
  photo_url text,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists citizen_reports_gu_time_idx on citizen_reports (gu_name, created_at desc);
create index if not exists citizen_reports_ip_rate_idx on citizen_reports (ip_hash, created_at desc);
