revoke all on public.cw_tags from anon;

create or replace function public.is_push_service_endpoint(_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (
      _endpoint ~ '^https://(fcm\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com|[a-z0-9-]+\\.push\\.services\\.mozilla\\.com|web\\.push\\.apple\\.com|[a-z0-9-]+\\.notify\\.windows\\.com)/'
      OR _endpoint ~ '^fcm:[A-Za-z0-9_:-]{20,1000}$'
      OR _endpoint ~ '^apns:[0-9a-fA-F]{64,200}$'
    )
    AND length(_endpoint) <= 1024;
$$;