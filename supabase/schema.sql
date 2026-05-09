-- Fitness AI Cloud schema for Supabase PostgreSQL
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.profile (
  id bigserial primary key,
  owner_hash text not null unique,
  name text default 'Ognjen',
  age integer default 19,
  sex text default 'male',
  height_cm integer default 188,
  start_weight numeric default 97,
  goal_weight numeric default 86,
  calorie_goal integer default 2200,
  protein_goal integer default 190,
  training_plan text default 'PPL 5x nedeljno',
  preferences text default 'Ne jede jaja, sir, ribu osim tunjevine. Koristi whey sa mlekom posle treninga.',
  updated_at timestamptz default now()
);

create table if not exists public.weights (
  id bigserial primary key,
  owner_hash text not null,
  date date not null,
  weight_kg numeric not null,
  notes text default '',
  created_at timestamptz default now(),
  unique(owner_hash, date)
);

create table if not exists public.meals (
  id bigserial primary key,
  owner_hash text not null,
  date date not null,
  raw_text text not null,
  summary text default '',
  total_kcal numeric default 0,
  total_protein numeric default 0,
  total_carbs numeric default 0,
  total_fat numeric default 0,
  created_at timestamptz default now()
);

create table if not exists public.meal_items (
  id bigserial primary key,
  owner_hash text not null,
  meal_id bigint not null references public.meals(id) on delete cascade,
  name text not null,
  amount_text text default '',
  grams numeric default null,
  kcal numeric default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fat numeric default 0,
  confidence numeric default 0.6
);

create table if not exists public.workouts (
  id bigserial primary key,
  owner_hash text not null,
  date date not null,
  raw_text text not null,
  type text default '',
  summary text default '',
  created_at timestamptz default now()
);

create table if not exists public.workout_exercises (
  id bigserial primary key,
  owner_hash text not null,
  workout_id bigint not null references public.workouts(id) on delete cascade,
  name text not null,
  sets integer default null,
  reps integer default null,
  weight_kg numeric default null,
  duration_min numeric default null,
  notes text default ''
);

create table if not exists public.progress_photos (
  id bigserial primary key,
  owner_hash text not null,
  date date not null,
  filename text not null,
  original_name text default '',
  note text default '',
  ai_comment text default '',
  created_at timestamptz default now()
);

create table if not exists public.ai_notes (
  id bigserial primary key,
  owner_hash text not null,
  date date not null,
  user_text text not null,
  ai_reply text not null,
  created_at timestamptz default now()
);

create table if not exists public.ai_memory (
  id bigserial primary key,
  owner_hash text not null,
  key text not null,
  value text not null,
  updated_at timestamptz default now(),
  unique(owner_hash, key)
);

create table if not exists public.food_catalog (
  id bigserial primary key,
  owner_hash text not null,
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  kcal_per_100g numeric default null,
  protein_per_100g numeric default null,
  carbs_per_100g numeric default 0,
  fat_per_100g numeric default 0,
  kcal_per_unit numeric default null,
  protein_per_unit numeric default null,
  carbs_per_unit numeric default 0,
  fat_per_unit numeric default 0,
  default_amount numeric default 100,
  default_unit text default 'g',
  updated_at timestamptz default now(),
  unique(owner_hash, name)
);

create table if not exists public.app_settings (
  id bigserial primary key,
  owner_hash text not null,
  key text not null,
  value text not null,
  updated_at timestamptz default now(),
  unique(owner_hash, key)
);

create index if not exists idx_weights_owner_date on public.weights(owner_hash, date);
create index if not exists idx_meals_owner_date on public.meals(owner_hash, date);
create index if not exists idx_workouts_owner_date on public.workouts(owner_hash, date);
create index if not exists idx_photos_owner_date on public.progress_photos(owner_hash, date);
create index if not exists idx_food_owner on public.food_catalog(owner_hash);

-- Storage bucket:
-- 1. Go to Supabase Dashboard -> Storage -> New bucket
-- 2. Name: progress-photos
-- 3. Keep it private. The backend creates signed URLs through /uploads/:filename.
