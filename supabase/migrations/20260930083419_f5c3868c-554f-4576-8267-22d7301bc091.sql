-- Blacktop Enterprise: the Workshop package (service tickets for riders
-- bringing their bikes in). Adds 'workshop' to the organisation tiers.
-- Mirrors src/features/enterprise/types.ts EnterpriseTier.

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_tier_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_tier_check
  CHECK (tier IN ('academy', 'showroom', 'workshop', 'touring', 'track_pro', 'billion'));