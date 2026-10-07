-- Fixes notifications for everyone: no device could register.
--
-- 20261006000000_native_push.sql widened is_push_service_endpoint() to take the
-- native apps' tokens with the patterns {20,1000} and {64,200}. Postgres allows
-- a repeat count of 255 at most, so the function raised "invalid regular
-- expression: invalid repetition count(s)" (2201B) on every call, a browser's
-- ordinary web push address included, and register_push_subscription failed
-- with it. The lengths are now checked with length(), and the patterns only
-- say which characters are allowed.

CREATE OR REPLACE FUNCTION public.is_push_service_endpoint(_endpoint text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT length(_endpoint) <= 1024
    AND (
      _endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
      -- "fcm:" and a token of 20 to 1000 characters
      OR (_endpoint ~ '^fcm:[A-Za-z0-9_:-]+$' AND length(_endpoint) BETWEEN 24 AND 1004)
      -- "apns:" and a hex token of 64 to 200 characters
      OR (_endpoint ~ '^apns:[0-9a-fA-F]+$' AND length(_endpoint) BETWEEN 69 AND 205)
    );
$$;