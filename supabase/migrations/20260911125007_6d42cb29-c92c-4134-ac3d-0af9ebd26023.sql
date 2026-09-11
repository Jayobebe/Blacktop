drop policy if exists card_photos_read on storage.objects;

create policy card_photos_read
on storage.objects
for select
to authenticated
using (bucket_id = 'card-photos' and owner = auth.uid());