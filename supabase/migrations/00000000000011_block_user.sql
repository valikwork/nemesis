-- Plan 5a (contract amendment 2026-07-12): blocking dissolves all live feuds
-- between the pair atomically. The blessed block path.

create or replace function block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_target = auth.uid() then
    raise exception 'self_block';
  end if;

  insert into blocks (blocker, blocked)
  values (auth.uid(), p_target)
  on conflict (blocker, blocked) do nothing;

  update feuds
  set status = 'dissolved', ended_at = now()
  where status in ('proposed','active')
    and profile_a = least(auth.uid(), p_target)
    and profile_b = greatest(auth.uid(), p_target);
end;
$$;

revoke execute on function block_user(uuid) from public;
grant execute on function block_user(uuid) to authenticated;
