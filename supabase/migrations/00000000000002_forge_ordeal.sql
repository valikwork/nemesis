-- Contract amendment 2026-07-11: forge-ordeal as Postgres RPC (not Edge Function).

create table banned_words (
  word text not null,
  language text not null check (language in ('en','uk')),
  primary key (word, language)
);

alter table banned_words enable row level security;
-- no policies: service/definer access only; clients never read the list
revoke all on table banned_words from anon, authenticated;

-- Seed a starter wordlist. Deliberately small; grows via later migrations.
-- 'testbanned' exists solely for integration tests.
insert into banned_words (word, language) values
  ('testbanned', 'en'),
  ('nigger', 'en'), ('faggot', 'en'), ('cunt', 'en'),
  ('хуй', 'uk'), ('пізда', 'uk'), ('підар', 'uk'), ('блядь', 'uk');

create or replace function forge_ordeal(p_name text, p_unit text, p_language text)
returns ordeals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordeal ordeals;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_language not in ('en','uk') then
    raise exception 'bad_language';
  end if;
  if char_length(trim(p_name)) not between 2 and 40 then
    raise exception 'ordeal_rejected';
  end if;
  if char_length(trim(p_unit)) not between 1 and 20 then
    raise exception 'ordeal_rejected';
  end if;
  if exists (
    select 1 from banned_words b
    where lower(p_name) like '%' || b.word || '%'
       or lower(p_unit) like '%' || b.word || '%'
  ) then
    raise exception 'ordeal_rejected' using errcode = 'P0002';
  end if;

  insert into ordeals (name_custom, unit_custom, is_custom, created_by, language, moderation_status)
  values (trim(p_name), trim(p_unit), true, auth.uid(), p_language, 'approved')
  returning * into v_ordeal;
  return v_ordeal;
end;
$$;

-- definer function: explicit, minimal execute grants (see contract: no blanket routine grants)
revoke execute on function forge_ordeal(text, text, text) from public;
grant execute on function forge_ordeal(text, text, text) to authenticated;
