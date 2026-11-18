-- Adds the "donation" action to append_public_sajra_action, used by the Donations feature.
-- A donor's claimed payment is appended to sajra_state.donationEntries as "pending"; an
-- admin/editor then confirms it (a normal authenticated sajra_state update, not this RPC) after
-- checking their own UPI account - this function never processes or verifies any payment itself.
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
  elsif p_action = 'donation' then
    member_id := (p_payload ->> 'donorMemberId')::bigint;
    select m ->> 'name' into member_name
      from jsonb_array_elements(coalesce(archive.state -> 'members', '[]'::jsonb)) m
      where (m ->> 'id')::bigint = member_id;
    if member_name is null then raise exception 'Profile not found'; end if;
    if (p_payload ->> 'cause') not in ('sickMember', 'masjid', 'madarsa', 'iftari', 'sehri') then
      raise exception 'Invalid cause';
    end if;
    if not (coalesce(archive.state -> 'donationSettings' -> 'activeCauses', '[]'::jsonb) ? (p_payload ->> 'cause')) then
      raise exception 'This cause is not currently open for donations';
    end if;
    if (p_payload ->> 'amount')::numeric <= 0 or (p_payload ->> 'amount')::numeric > 1000000 then
      raise exception 'Invalid amount';
    end if;
    select coalesce(max((r ->> 'id')::bigint), 0) + 1 into next_id from jsonb_array_elements(coalesce(archive.state -> 'donationEntries', '[]'::jsonb)) r;
    item := jsonb_build_object(
      'id', next_id, 'cause', p_payload ->> 'cause', 'donorMemberId', member_id, 'donorName', member_name,
      'amount', (p_payload ->> 'amount')::numeric, 'status', 'pending', 'createdAt', now()
    );
    new_array := jsonb_build_array(item) || coalesce(archive.state -> 'donationEntries', '[]'::jsonb);
    update public.sajra_state set state = jsonb_set(archive.state, '{donationEntries}', (
      select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) from jsonb_array_elements(new_array) with ordinality as rows(value, ord) where ord <= 500
    )), updated_at = now() where id = 'main';
    return item;
  else
    raise exception 'Unsupported public action';
  end if;
end;
$$;
