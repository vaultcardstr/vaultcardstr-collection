-- VaultCardstr security hardening
-- Run this ONCE in Supabase SQL Editor.
-- Public collection viewing remains available.
-- Signed-in users can only modify their own records/files.

alter table public.cards add column if not exists owner_id uuid;
alter table public.cards add column if not exists for_trade boolean not null default false;
create index if not exists cards_owner_id_idx on public.cards (owner_id);
alter table public.cards enable row level security;

drop policy if exists "Public can view cards" on public.cards;
drop policy if exists "Authenticated can add cards" on public.cards;
drop policy if exists "Authenticated can edit cards" on public.cards;
drop policy if exists "Authenticated can delete cards" on public.cards;

create policy "Public can view cards" on public.cards
for select to anon, authenticated using (true);

create policy "Users can add their own cards" on public.cards
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can edit their own cards" on public.cards
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their own cards" on public.cards
for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke insert, update, delete on public.cards from anon;
grant select on public.cards to anon, authenticated;
grant insert, update, delete on public.cards to authenticated;


alter table public.profiles enable row level security;

drop policy if exists "Public can view profiles" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Public can view profiles" on public.profiles
for select to anon, authenticated using (true);

create policy "Users can update their own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke insert, update, delete on public.profiles from anon;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;


alter table public.profile_pcs enable row level security;

drop policy if exists "Public can view profile PCs" on public.profile_pcs;
drop policy if exists "Users can add own profile PCs" on public.profile_pcs;
drop policy if exists "Users can edit own profile PCs" on public.profile_pcs;
drop policy if exists "Users can delete own profile PCs" on public.profile_pcs;

create policy "Public can view profile PCs" on public.profile_pcs
for select to anon, authenticated using (true);

create policy "Users can add own profile PCs" on public.profile_pcs
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can edit own profile PCs" on public.profile_pcs
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete own profile PCs" on public.profile_pcs
for delete to authenticated
using ((select auth.uid()) = owner_id);

revoke insert, update, delete on public.profile_pcs from anon;
grant select on public.profile_pcs to anon, authenticated;
grant insert, update, delete on public.profile_pcs to authenticated;


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', true, 6291456,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 6291456,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view card images" on storage.objects;
drop policy if exists "Authenticated can upload card images" on storage.objects;
drop policy if exists "Authenticated can update card images" on storage.objects;
drop policy if exists "Authenticated can delete card images" on storage.objects;

create policy "Public can view card images" on storage.objects
for select to anon, authenticated using (bucket_id = 'card-images');

create policy "Users can upload their own card images" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can update their own card images" on storage.objects
for update to authenticated
using (bucket_id = 'card-images' and owner_id = (select auth.uid()::text))
with check (
  bucket_id = 'card-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their own card images" on storage.objects
for delete to authenticated
using (bucket_id = 'card-images' and owner_id = (select auth.uid()::text));


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "Users can upload their own avatars" on storage.objects;
drop policy if exists "Users can update their own avatars" on storage.objects;
drop policy if exists "Users can delete their own avatars" on storage.objects;

create policy "Public can view avatars" on storage.objects
for select to anon, authenticated using (bucket_id = 'avatars');

create policy "Users can upload their own avatars" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can update their own avatars" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text))
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their own avatars" on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));

revoke insert, update, delete on storage.objects from anon;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;


-- =========================================================
-- 7) Safer defaults for future public-schema objects.
--    Future tables will not automatically become reachable
--    by anon/authenticated until we explicitly grant access.
-- =========================================================

alter default privileges for role postgres in schema public
revoke select, insert, update, delete on tables from anon, authenticated;

alter default privileges for role postgres in schema public
revoke usage, select on sequences from anon, authenticated;


-- =========================================================
-- 8) Verification queries
--    These are read-only. Run them after the migration.
-- =========================================================

-- Existing cards that do not have an owner yet.
select count(*) as cards_without_owner
from public.cards
where owner_id is null;

-- Old flat card-image objects. New uploads should be under <user-id>/...
select count(*) as old_card_image_objects
from storage.objects
where bucket_id = 'card-images'
  and (storage.foldername(name))[1] is null;

-- Old flat avatar objects. New uploads should be under <user-id>/...
select count(*) as old_avatar_objects
from storage.objects
where bucket_id = 'avatars'
  and (storage.foldername(name))[1] is null;
