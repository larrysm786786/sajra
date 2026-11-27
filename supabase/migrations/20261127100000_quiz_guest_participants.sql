-- Permit quiz entry by people outside the Sajra member directory.
alter table public.quiz_entries alter column member_id drop not null;
alter table public.quiz_entries add column if not exists participant_key text;
update public.quiz_entries set participant_key = 'member:' || member_id::text where participant_key is null;
alter table public.quiz_entries alter column participant_key set not null;
alter table public.quiz_entries drop constraint if exists quiz_entries_competition_id_member_id_key;
alter table public.quiz_entries add constraint quiz_entries_competition_participant_key_key unique (competition_id, participant_key);
