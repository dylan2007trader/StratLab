-- StratLab — Supabase schema. Paste this into the Supabase SQL Editor and Run.
-- It creates the bots table and locks it down so each user can only see and
-- change their own bots (Row Level Security).

create table if not exists public.bots (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  data        jsonb not null,
  -- denormalized for the public leaderboard (Stage 2); safe to keep null for now
  published   boolean not null default false,
  display_name text,
  symbol       text,
  oos_return   double precision,
  forward_return double precision,
  updated_at  timestamptz not null default now()
);

create index if not exists bots_user_id_idx on public.bots (user_id);
create index if not exists bots_published_idx on public.bots (published);

alter table public.bots enable row level security;

-- Owners can do anything with their own rows.
drop policy if exists "own bots - select" on public.bots;
create policy "own bots - select" on public.bots
  for select using (auth.uid() = user_id);

drop policy if exists "own bots - insert" on public.bots;
create policy "own bots - insert" on public.bots
  for insert with check (auth.uid() = user_id);

drop policy if exists "own bots - update" on public.bots;
create policy "own bots - update" on public.bots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bots - delete" on public.bots;
create policy "own bots - delete" on public.bots
  for delete using (auth.uid() = user_id);

-- Anyone (even signed-out) can read PUBLISHED bots — this powers the public
-- Summit leaderboard in Stage 2.
drop policy if exists "published bots - public read" on public.bots;
create policy "published bots - public read" on public.bots
  for select using (published = true);
