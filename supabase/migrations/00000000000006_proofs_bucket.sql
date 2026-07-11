-- Plan 3a: private proofs bucket. Path convention: {feud_id}/{filename}.
-- Membership is derived from the first path segment.

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

create policy proofs_member_read on storage.objects for select
  using (
    bucket_id = 'proofs'
    and exists (
      select 1 from public.feuds f
      where f.id::text = (storage.foldername(name))[1]
        and auth.uid() in (f.profile_a, f.profile_b)
    )
  );

create policy proofs_member_insert on storage.objects for insert
  with check (
    bucket_id = 'proofs'
    and exists (
      select 1 from public.feuds f
      where f.id::text = (storage.foldername(name))[1]
        and f.status = 'active'
        and auth.uid() in (f.profile_a, f.profile_b)
    )
  );
