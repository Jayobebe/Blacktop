ALTER TABLE public.discord_integrations
  ADD CONSTRAINT webhook_url_discord_only
  CHECK (webhook_url ~ '^https://(canary\.|ptb\.)?discord(app)?\.com/api/webhooks/');