create table if not exists public.profile_update_links (
  token_hash text primary key,
  member_id bigint not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);

alter table public.profile_update_links enable row level security;
revoke all on public.profile_update_links from public, anon, authenticated;
grant all on public.profile_update_links to service_role;

-- Replace any permissive legacy policies on the one-row archive. Public clients
-- may still read family profiles, but only signed-in staff may write the archive.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'sajra_state'
  loop
    execute format('drop policy if exists %I on public.sajra_state', policy_row.policyname);
  end loop;
end $$;

alter table public.sajra_state enable row level security;
revoke all on public.sajra_state from public, anon, authenticated;
grant select on public.sajra_state to anon, authenticated;
grant insert, update on public.sajra_state to authenticated;

create policy "Public can read Sajra archive" on public.sajra_state
  for select to anon, authenticated using (true);

create policy "Staff can initialize Sajra archive" on public.sajra_state
  for insert to authenticated
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin') in ('admin', 'editor', 'contributor'));

create policy "Staff can update Sajra archive" on public.sajra_state
  for update to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin') in ('admin', 'editor', 'contributor'))
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin') in ('admin', 'editor', 'contributor'));

create or replace function public.append_public_sajra_action(
  p_action text,
  p_payload jsonb,
  p_token_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  archive public.sajra_state%rowtype;
  item jsonb;
  new_array jsonb;
  next_id bigint;
  member_id bigint;
  member_name text;
  link public.profile_update_links%rowtype;
begin
  select * into archive from public.sajra_state where id = 'main' for update;
  if not found then raise exception 'Sajra archive is not initialized'; end if;

  if p_action = 'profile_update' then
    select * into link from public.profile_update_links
      where token_hash = p_token_hash and revoked_at is null and used_at is null and expires_at > now()
      for update;
    if not found then raise exception 'This profile link is invalid, expired, or already used'; end if;
    member_id := link.member_id;
    select m ->> 'name' into member_name
      from jsonb_array_elements(coalesce(archive.state -> 'members', '[]'::jsonb)) m
      where (m ->> 'id')::bigint = member_id;
    if member_name is null then raise exception 'The linked profile no longer exists'; end if;
    select coalesce(max((r ->> 'id')::bigint), 0) + 1 into next_id
      from jsonb_array_elements(coalesce(archive.state -> 'memberUpdateRequests', '[]'::jsonb)) r;
    item := jsonb_build_object(
      'id', next_id, 'memberId', member_id, 'memberName', member_name,
      'photo', p_payload -> 'photo', 'bio', p_payload -> 'bio',
      'contact', p_payload -> 'contact', 'profession', p_payload -> 'profession',
      'publications', coalesce(p_payload -> 'publications', '[]'::jsonb),
      'status', 'pending', 'createdAt', now()
    );
    new_array := jsonb_build_array(item) || coalesce(archive.state -> 'memberUpdateRequests', '[]'::jsonb);
    update public.profile_update_links set used_at = now() where token_hash = link.token_hash;
    update public.sajra_state set state = jsonb_set(archive.state, '{memberUpdateRequests}', (
      select coalesce(jsonb_agg(value order by ord), '[]'::jsonb)
      from jsonb_array_elements(new_array) with ordinality as rows(value, ord) where ord <= 200
    )), updated_at = now() where id = 'main';
    return item;
  elsif p_action = 'suggestion' or p_action = 'feedback' then
    member_id := nullif(p_payload ->> 'memberId', '')::bigint;
    member_name := null;
    if member_id is not null then
      select m ->> 'name' into member_name from jsonb_array_elements(coalesce(archive.state -> 'members', '[]'::jsonb)) m where (m ->> 'id')::bigint = member_id;
      if member_name is null then raise exception 'Profile not found'; end if;
    end if;
    select coalesce(max((r ->> 'id')::bigint), 0) + 1 into next_id from jsonb_array_elements(coalesce(archive.state -> 'suggestions', '[]'::jsonb)) r;
    item := jsonb_build_object('id', next_id, 'memberId', member_id, 'memberName', member_name,
      'message', p_payload ->> 'message', 'submitterName', coalesce(nullif(p_payload ->> 'submitterName', ''), case when p_action = 'feedback' then 'Anis Ai visitor feedback' else null end),
      'status', 'pending', 'createdAt', now());
    new_array := jsonb_build_array(item) || coalesce(archive.state -> 'suggestions', '[]'::jsonb);
    update public.sajra_state set state = jsonb_set(archive.state, '{suggestions}', (
      select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) from jsonb_array_elements(new_array) with ordinality as rows(value, ord) where ord <= 200
    )), updated_at = now() where id = 'main';
    return item;
  elsif p_action = 'dua' then
    select coalesce(max((r ->> 'id')::bigint), 0) + 1 into next_id from jsonb_array_elements(coalesce(archive.state -> 'duaRequests', '[]'::jsonb)) r;
    item := jsonb_build_object('id', next_id, 'message', p_payload ->> 'message', 'requesterName', nullif(p_payload ->> 'requesterName', ''), 'status', 'open', 'createdAt', now());
    new_array := jsonb_build_array(item) || coalesce(archive.state -> 'duaRequests', '[]'::jsonb);
    update public.sajra_state set state = jsonb_set(archive.state, '{duaRequests}', (
      select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) from jsonb_array_elements(new_array) with ordinality as rows(value, ord) where ord <= 200
    )), updated_at = now() where id = 'main';
    return item;
  elsif p_action = 'guestbook' then
    member_id := (p_payload ->> 'memberId')::bigint;
    if not exists (select 1 from jsonb_array_elements(coalesce(archive.state -> 'members', '[]'::jsonb)) m where (m ->> 'id')::bigint = member_id) then raise exception 'Profile not found'; end if;
    select coalesce(max((r ->> 'id')::bigint), 0) + 1 into next_id from jsonb_array_elements(coalesce(archive.state -> 'profileComments', '[]'::jsonb)) r;
    item := jsonb_build_object('id', next_id, 'memberId', member_id, 'message', p_payload ->> 'message', 'authorName', nullif(p_payload ->> 'authorName', ''), 'createdAt', now());
    new_array := jsonb_build_array(item) || coalesce(archive.state -> 'profileComments', '[]'::jsonb);
    update public.sajra_state set state = jsonb_set(archive.state, '{profileComments}', (
      select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) from jsonb_array_elements(new_array) with ordinality as rows(value, ord) where ord <= 2000
    )), updated_at = now() where id = 'main';
    return item;
  else
    raise exception 'Unsupported public action';
  end if;
end;
$$;

revoke all on function public.append_public_sajra_action(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.append_public_sajra_action(text, jsonb, text) to service_role;
