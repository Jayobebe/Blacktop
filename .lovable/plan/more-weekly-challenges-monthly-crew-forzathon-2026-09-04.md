# More weekly challenges + monthly crew Forzathon

Grow the crew challenge system from one rotating challenge a week into a fuller
programme: a bigger weekly pool, brand-new riding metrics, two challenges running
each week, special event weeks, and a monthly Forzathon-style goal the whole crew
chases together.

## What you'll see

**Crew Challenge page, reorganised top to bottom:**

1. **Monthly Crew Goal (Forzathon-style)** — a banner card at the top with the
   month's shared objective (e.g. "Crew Marathon — 2,000 combined miles"). One
   collective progress bar fed by *everyone's* weekly score rows for the month,
   so the bar moves whenever any crew member rides. When the crew hits the goal,
   every participating member earns a spare card copy (subject to the 4/month
   copy bank cap).
2. **This week's challenges (two at once)** — two side-by-side challenge cards
   instead of one, each with its own progress bar, leaderboard and reward. The
   pair is picked deterministically from the week number, always two different
   metrics, so every crew sees the same two without any server scheduling.
3. **Special event weeks** — the first full week of each month and the weeks of
   solstice/equinox surface a "Special Event" badge and a themed challenge
   (e.g. "New Year, New Roads" in the first week of January) with a boosted
   reward.

**Bigger weekly pool** — the challenge list grows from 4 to ~12 using existing
metrics (varied titles, blurbs and targets), e.g.:

- Mile Muncher / Grand Tour / Sunday Smasher (distance, different targets)
- Always Out / Daily Rider (ride count)
- Knee Down / Full Lean Send (max lean)
- Corner Carver / Smooth Operator (corner score)

**New riding metrics** (three new tracked stats, extending the rotation):

- **Top speed** — "Terminal Velocity": highest top speed of the week.
- **Night rides** — "Night Owl": most rides started after 8pm or before 5am.
- **Longest single ride** — "Iron Butt": longest single ride in the week.

All weekly rewards keep the existing rule: hitting a target earns a spare card
copy, capped at 4 bonus copies a month, and the copy ledger counts each
challenge separately so two weekly challenges can each pay out.

## Technical details

- **Migration:** add `top_speed numeric`, `night_rides integer`,
  `longest_ride numeric` columns (all default 0) to `crew_weekly_scores`, and
  extend the `list_crew_challenge` RPC to return them. No new tables; RLS
  unchanged.
- **`challenges.ts`:** expand `CHALLENGES`, widen `ChallengeMetric` with
  `'top_speed' | 'night_rides' | 'longest_ride'`, add
  `challengesForWeek(key)` returning the deterministic pair, special-event
  detection (`specialForWeek(key)`), and a `MONTHLY_GOALS` list with
  `monthKey()` / `monthlyGoalFor(key)` helpers.
- **CrewChallenges.tsx:** compute the three new stats from local ride history
  (`startedAt` hour for night rides, max per-ride distance, max top speed),
  include them in the weekly upsert, render two challenge cards + the monthly
  crew goal card, and grant copies per challenge id (`grantChallengeCopy(\`${key}:${id}\`)`).
- **Monthly progress:** sum of the crew's weekly score rows across the month's
  weeks via a new `list_crew_month(_crew_code, _month_key)` RPC (SECURITY
  DEFINER, aggregated, same privacy posture as the existing list functions).
- **Demo showcase:** update the Crew Challenge slide text to mention two weekly
  challenges and the monthly crew goal.

## Verification

- `npm run lint` and the automatic build pass.
- Manual check: challenge page renders two weekly cards + monthly goal with the
  signed-in rider's row highlighted.
