-- Nodedr OrderRestro — Supabase PostgreSQL Schema
-- Run this in your Supabase SQL Editor to enable remote Supabase persistence.

create table if not exists public.orderrestro_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.orderrestro_state enable row level security;

-- Allow POS server & authenticated clients to read/write operational state
create policy "Allow OrderRestro POS access"
  on public.orderrestro_state
  for all
  using (true)
  with check (true);

-- Optional normalized relational tables for direct SQL reporting & Supabase Table Editor inspection
create table if not exists public.branches (
  id text primary key,
  name text not null,
  code text not null,
  city text,
  tax_regime text not null default 'IN_GST',
  currency text not null default 'INR',
  upi_vpa text,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id text primary key,
  order_number text not null,
  branch_id text references public.branches(id),
  channel text not null,
  status text not null,
  table_label text,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  paid_total numeric(12,2) not null default 0,
  created_at timestamptz default now()
);
