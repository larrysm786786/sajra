-- Private storage and records for future memory capsules, prize quizzes,
-- member-submitted photos, and rotating savings committees.
-- Client access goes through the sajra-features Edge Function only.

create table if not exists public.family_memory_capsules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  media_path text,
  media_type text,
  reveal_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.member_gallery_submissions (
  id uuid primary key default gen_random_uuid(),
  member_id bigint not null,
  caption text,
  media_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

create table if not exists public.quiz_competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  prize text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_seconds integer not null default 300 check (duration_seconds between 60 and 3600),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'completed', 'cancelled')),
  winner_entry_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.quiz_competitions(id) on delete cascade,
  prompt text not null,
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 6),
  correct_index integer not null check (correct_index >= 0),
  position integer not null,
  unique (competition_id, position)
);

create table if not exists public.quiz_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.quiz_competitions(id) on delete cascade,
  member_id bigint not null,
  member_name text not null,
  started_at timestamptz,
  submitted_at timestamptz,
  score integer,
  answers jsonb,
  presented_questions jsonb,
  created_at timestamptz not null default now(),
  unique (competition_id, member_id)
);
alter table public.quiz_competitions drop constraint if exists quiz_competitions_winner_entry_id_fkey;
alter table public.quiz_competitions add constraint quiz_competitions_winner_entry_id_fkey
  foreign key (winner_entry_id) references public.quiz_entries(id) on delete set null;

create table if not exists public.savings_committees (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  installment_amount numeric(12,2) not null check (installment_amount > 0),
  frequency text not null default 'monthly' check (frequency = 'monthly'),
  starts_on date not null,
  status text not null default 'enrolling' check (status in ('enrolling', 'active', 'completed', 'paused', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  locked_at timestamptz
);

create table if not exists public.savings_committee_members (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.savings_committees(id) on delete cascade,
  member_id bigint not null,
  member_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  draw_number integer,
  joined_at timestamptz not null default now(),
  unique (committee_id, member_id),
  unique (committee_id, draw_number)
);

create table if not exists public.savings_committee_contributions (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.savings_committees(id) on delete cascade,
  member_id bigint not null,
  cycle_number integer not null check (cycle_number > 0),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'received')),
  received_at timestamptz,
  confirmed_by uuid references auth.users(id),
  unique (committee_id, member_id, cycle_number)
);

create table if not exists public.savings_committee_payouts (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.savings_committees(id) on delete cascade,
  member_id bigint not null,
  member_name text not null,
  cycle_number integer not null check (cycle_number > 0),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  confirmed_by uuid references auth.users(id),
  unique (committee_id, cycle_number),
  unique (committee_id, member_id)
);

create table if not exists public.family_feature_audit (
  id bigint generated always as identity primary key,
  feature text not null check (feature in ('capsule', 'member_gallery', 'quiz', 'committee')),
  record_id uuid,
  action text not null,
  actor_id uuid references auth.users(id),
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.family_memory_capsules enable row level security;
alter table public.member_gallery_submissions enable row level security;
alter table public.quiz_competitions enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_entries enable row level security;
alter table public.savings_committees enable row level security;
alter table public.savings_committee_members enable row level security;
alter table public.savings_committee_contributions enable row level security;
alter table public.savings_committee_payouts enable row level security;
alter table public.family_feature_audit enable row level security;

revoke all on public.family_memory_capsules, public.member_gallery_submissions,
  public.quiz_competitions, public.quiz_questions, public.quiz_entries,
  public.savings_committees, public.savings_committee_members,
  public.savings_committee_contributions, public.savings_committee_payouts,
  public.family_feature_audit
  from public, anon, authenticated;
grant all on public.family_memory_capsules, public.member_gallery_submissions,
  public.quiz_competitions, public.quiz_questions, public.quiz_entries,
  public.savings_committees, public.savings_committee_members,
  public.savings_committee_contributions, public.savings_committee_payouts to service_role;
grant all on public.family_feature_audit to service_role;

-- Generate the committee's draw, contribution ledger, payout schedule and activation atomically.
create or replace function public.lock_savings_committee(p_committee_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  committee_row public.savings_committees%rowtype;
  participant_count integer;
  draw_data jsonb;
begin
  select * into committee_row from public.savings_committees where id = p_committee_id for update;
  if not found or committee_row.status <> 'enrolling' then raise exception 'Committee is not accepting a draw.'; end if;
  select count(*) into participant_count from public.savings_committee_members where committee_id = p_committee_id and status = 'approved';
  if participant_count < 2 then raise exception 'At least two approved participants are required.'; end if;

  with shuffled as (
    select id, row_number() over (order by gen_random_uuid())::integer as draw_number
    from public.savings_committee_members where committee_id = p_committee_id and status = 'approved'
  )
  update public.savings_committee_members m set draw_number = shuffled.draw_number
  from shuffled where m.id = shuffled.id;

  insert into public.savings_committee_contributions (committee_id, member_id, cycle_number, amount)
  select p_committee_id, m.member_id, cycles.cycle_number, committee_row.installment_amount
  from public.savings_committee_members m cross join generate_series(1, participant_count) as cycles(cycle_number)
  where m.committee_id = p_committee_id and m.status = 'approved';

  insert into public.savings_committee_payouts (committee_id, member_id, member_name, cycle_number, amount)
  select p_committee_id, m.member_id, m.member_name, m.draw_number,
         committee_row.installment_amount * participant_count
  from public.savings_committee_members m where m.committee_id = p_committee_id and m.status = 'approved';

  update public.savings_committees set status = 'active', locked_at = now() where id = p_committee_id;
  select jsonb_agg(jsonb_build_object('memberId', member_id, 'memberName', member_name, 'drawNumber', draw_number) order by draw_number)
    into draw_data from public.savings_committee_members where committee_id = p_committee_id and status = 'approved';
  return draw_data;
end;
$$;
revoke all on function public.lock_savings_committee(uuid) from public, anon, authenticated;
grant execute on function public.lock_savings_committee(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sajra-private-family-media', 'sajra-private-family-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

