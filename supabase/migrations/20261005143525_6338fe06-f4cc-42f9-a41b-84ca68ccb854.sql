-- Push for the native store app. Its devices register through the same
-- register_push_subscription as the web, with the endpoint "fcm:<token>"
-- (Android, Firebase Cloud Messaging) or "apns:<token>" (iOS), so crews,
-- nearby riders and weather areas target them like any other device. send-push
-- delivers them once its FCM / APNs secrets are set (send-push/native.ts) and
-- skips them until then.
--
-- Only the endpoint check changes: browser push services as before, plus those
-- two token shapes (never a URL, so the sender still can't be pointed anywhere).

CREATE OR REPLACE FUNCTION public.is_push_service_endpoint(_endpoint text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
      _endpoint ~ '^https://(fcm\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com|[a-z0-9-]+\\.push\\.services\\.mozilla\\.com|web\\.push\\.apple\\.com|[a-z0-9-]+\\.notify\\.windows\\.com)/'
      OR _endpoint ~ '^fcm:[A-Za-z0-9_:-]{20,1000}$'
      OR _endpoint ~ '^apns:[0-9a-fA-F]{64,200}$'
    )
    AND length(_endpoint) <= 1024;
$$;