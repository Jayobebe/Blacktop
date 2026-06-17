# Discord Integration Plan

Optional Discord integration that, when a server is connected, replaces BlackTop's WebRTC voice channel with a Discord voice channel, pings the server on convoy creation and rescue events, and streams Spotify playlists via a hosted music bot. When no server is connected, everything falls back to the current behavior.

## Architecture overview

```text
BlackTop App (React)
   │
   │  (REST / Realtime)
   ▼
Lovable Cloud (Supabase)
   │  - discord_servers table (per-convoy or per-user link)
   │  - convoy <-> discord_channel mapping
   │  - edge functions (link server, ping convoy, ping rescue,
   │                    start/stop music, queue track)
   ▼
BlackTop Bot Service (external, always-on host — NOT Lovable)
   │  - discord.js gateway client (voice + messages)
   │  - lavalink / discord-player for audio
   │  - Spotify Web API (playlist resolution)
   │  - HTTP API authenticated by shared secret from Supabase
   ▼
Discord  ◀── users join voice channel directly in Discord app
```

Lovable Cloud edge functions cannot hold a persistent Discord gateway/voice connection, so the bot must run on a separate always-on host (Fly.io, Railway, a VPS, etc.). Lovable handles the app, DB, auth, and request/response edge functions that talk to the bot.

## Phased delivery

### Phase 1 — Server link + chat pings (fully buildable in Lovable)
1. Discord OAuth "Add to Server" flow for an admin.
2. Settings → Integrations → **Connect Discord Server**: stores guild id, default text channel id, default voice channel id, and a webhook URL.
3. New table `discord_integrations` (guild_id, owner_user_id, webhook_url, default_voice_channel_id, default_text_channel_id, role_to_ping nullable).
4. On **Create Convoy**: modal asks "Ping your Discord server?" → edge function posts a rich embed via webhook with convoy name, code, and a `https://convoy-comms.lovable.app/join/<code>` deep link.
5. On **Rescue Alert**: edge function posts an embed to the same channel with rider name, location link (Google Maps URL), and convoy code.
6. UI: badge in Lobby showing "Connected to <ServerName>" + per-convoy toggle "Auto-announce to Discord".

### Phase 2 — Voice channel hosting via Discord
1. When a convoy is created and a server is linked, BlackTop selects (or creates) a Discord voice channel via the bot and stores its id on the convoy row.
2. Active ride UI replaces the in-app WebRTC voice panel with:
   - "Open in Discord" deep link (`discord://channels/<guild>/<channel>`).
   - Live member list pulled from the bot (who is in the voice channel, who is speaking, who is muted) via Realtime broadcasts the bot pushes into Supabase.
   - Mute mic button → bot moves the user (server-mute) via Discord API.
3. `useVoiceChannel` hook gains a `provider: 'webrtc' | 'discord'` branch. Discord branch never opens `getUserMedia`; it only renders state.
4. Fallback: if a member has not linked their Discord account, they get the existing WebRTC channel and a banner "Link Discord to join the convoy voice channel."

### Phase 3 — Spotify playlist playback
1. New Settings → Music section: connect Spotify account (per-user OAuth, stored encrypted in Supabase) and pick a default playlist.
2. Active ride UI gains a music card with Play / Pause / Skip, current track, mic mute, and music mute (music mute = bot lowers music bot volume only for the requesting user via Discord's per-user volume; mic mute behaves as Phase 2).
3. Edge function `music-control` forwards commands to the bot HTTP API. Bot resolves Spotify playlist → track metadata, streams playable audio source (must comply with Spotify ToS — likely via Spotify's official preview or a licensed audio provider; see "Open questions").
4. Only the convoy leader can start/stop/skip; others can adjust their own music volume.

## Database changes (Lovable Cloud)
- `discord_integrations`: guild link per user.
- `convoy_discord`: convoy_id, guild_id, voice_channel_id, text_channel_id, announce_enabled.
- `user_discord_links`: user_id, discord_user_id, access_token (encrypted), refresh_token.
- `user_spotify_links`: user_id, spotify_user_id, refresh_token (encrypted), default_playlist_id.
- All tables: explicit `GRANT`s + RLS scoped to `auth.uid()`.

## Edge functions (Lovable)
- `discord-oauth-callback`
- `discord-link-server`
- `discord-announce-convoy`
- `discord-announce-rescue`
- `discord-provision-voice-channel`
- `spotify-oauth-callback`
- `music-control` (proxy to bot)

All bot-bound calls go to the bot's HTTPS endpoint signed with a shared secret stored via `add_secret` (`BLACKTOP_BOT_URL`, `BLACKTOP_BOT_SHARED_SECRET`).

## External bot service (NOT in Lovable repo)
Built and deployed separately. Responsibilities:
- Discord gateway + voice connection (discord.js + @discordjs/voice).
- Music playback (discord-player or lavalink).
- Spotify Web API for playlist/track resolution.
- HTTP API: `/announce`, `/rescue`, `/voice/provision`, `/music/play`, `/music/pause`, `/music/skip`, `/voice/state/:guild/:channel`.
- Pushes voice-state and now-playing updates back to Supabase Realtime so the app UI stays in sync.

## Frontend changes (high level)
- `src/features/integrations/discord/` — settings UI, OAuth callback page, hooks.
- `src/features/integrations/spotify/` — settings UI, OAuth callback page.
- `src/features/voice/hooks/useVoiceChannel.ts` — provider switch.
- `src/pages/CreateConvoy.tsx` — "Ping Discord?" toggle.
- `src/features/rescue/hooks/useRescue.ts` — also call `discord-announce-rescue`.
- `src/pages/ActiveRide.tsx` — music card + Discord voice card when applicable.

## Open questions / risks
- **Spotify ToS**: Discord bots cannot legally stream Spotify's full catalog audio. We can pull playlist metadata from Spotify, but actual audio playback will likely need a licensed source (YouTube via official API, SoundCloud, Audius, or user-uploaded files). Confirm before Phase 3.
- **Bot hosting cost**: requires an always-on server outside Lovable; user must own that infra or use a managed host.
- **Discord developer app**: requires creating a Discord application + bot, and getting verified once the bot is in >100 servers.

## Recommendation
Ship Phase 1 first inside Lovable (entirely doable here) so convoy + rescue pings work end-to-end. Treat Phase 2 and Phase 3 as a separate build-out that depends on standing up the external bot service.
