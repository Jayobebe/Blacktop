import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Check, Crown, Heart, LogOut, Map as MapIcon, Trophy, Users } from 'lucide-react';
import { ACCENT_COLORS, useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { useDerezLobby } from '@/features/arcade/hooks/useDerezLobby';
import { bumpScore, useArcadeScores } from '@/features/arcade/hooks/useArcadeScores';
import { DerezArenaDrawer } from '@/features/arcade/components/games/derez/DerezArenaDrawer';
import { DerezGameView } from '@/features/arcade/components/games/derez/DerezGameView';
import { polygonAreaM2 } from '@/features/arcade/lib/derezGeo';
import { toast } from 'sonner';

function colorOf(id: string) {
  const c = ACCENT_COLORS.find(a => a.id === id) ?? ACCENT_COLORS[0];
  return `hsl(${c.hsl.trim().split(/\s+/).join(', ')})`;
}

export default function ArcadeDerezLegacy() {
  const navigate = useNavigate();
  const { code: codeParam } = useParams();
  const { settings } = useSettings();
  const { profile } = useProfile();
  const { scores } = useArcadeScores();
  const accent = colorOf(settings.accentColor);

  const {
    lobby, players, me, userId, isLeader, busy,
    createLobby, joinLobby, leaveLobby, setReady, setLives, setArena,
    startCountdown, goLive, finishRound, resetToLobby, reportDeath,
  } = useDerezLobby();

  const [joinCode, setJoinCode] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoJoined, setAutoJoined] = useState(false);
  const [winRecorded, setWinRecorded] = useState<string | null>(null);

  // QR deep-link join
  useEffect(() => {
    if (!codeParam || autoJoined || lobby) return;
    setAutoJoined(true);
    joinLobby(codeParam, profile.name, settings.accentColor);
  }, [codeParam, autoJoined, lobby, joinLobby, profile.name, settings.accentColor]);

  // Countdown ticker
  useEffect(() => {
    if (lobby?.state !== 'countdown' || !lobby.startedAt) { setCountdown(null); return; }
    const target = new Date(lobby.startedAt).getTime();
    const tick = () => {
      const left = Math.ceil((target - Date.now()) / 1000);
      setCountdown(Math.max(0, left));
      if (left <= 0 && isLeader) goLive();
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [lobby?.state, lobby?.startedAt, isLeader, goLive]);

  // Leader decides the round winner
  useEffect(() => {
    if (!isLeader || lobby?.state !== 'live' || players.length === 0) return;
    const alive = players.filter(p => p.isAlive);
    if (alive.length <= 1) finishRound(alive[0] ?? null);
  }, [isLeader, lobby?.state, players, finishRound]);

  // Tally a local win
  useEffect(() => {
    if (lobby?.state !== 'finished' || !lobby.winnerId || !userId) return;
    const stamp = `${lobby.id}:${lobby.roundSeq}`;
    if (winRecorded === stamp) return;
    setWinRecorded(stamp);
    if (lobby.winnerId === userId) {
      bumpScore('legacy-derez');
      toast.success('Last rider standing', { description: 'Legacy win banked.' });
    }
  }, [lobby?.state, lobby?.winnerId, lobby?.id, lobby?.roundSeq, userId, winRecorded]);

  const arenaArea = useMemo(
    () => (lobby?.arena?.ring?.length ?? 0) > 2 ? Math.round(polygonAreaM2(lobby!.arena!.ring)) : 0,
    [lobby?.arena],
  );

  const allReady = players.length >= 2 && players.every(p => p.isReady);
  const joinUrl = lobby ? `${window.location.origin}/arcade/derez-legacy/${lobby.code}` : '';

  const exit = async () => { await leaveLobby(); navigate('/world'); };

  // ---- No lobby: create / join -----------------------------------------
  if (!lobby) {
    return (
      <div className="min-h-dvh bg-background flex flex-col safe-top safe-bottom">
        <Header title="Derez Legacy" onBack={() => navigate(-1)} />
        <div className="flex-1 px-4 pb-6 flex flex-col gap-4">
          <div className="rounded-2xl border border-border/30 bg-card/50 p-4">
            <p className="text-sm text-white font-semibold">Real-world lightcycles</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Draw an arena on the map, ride inside it, and leave a trail in your accent colour.
              Cross anyone's line — or your own — and you lose a life. Last rider standing wins.
            </p>
            <p className="text-[10px] text-amber-500/80 mt-2">
              Private land or a quiet car park only. Ride slow, eyes up, phone mounted.
            </p>
          </div>

          <button
            onClick={() => createLobby(profile.name, settings.accentColor)}
            disabled={busy}
            className="w-full py-4 rounded-2xl border-2 font-semibold text-sm disabled:opacity-50"
            style={{ borderColor: accent, color: accent }}
          >
            Create lobby
          </button>

          <div className="rounded-2xl border border-border/30 bg-card/50 p-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Join with a code</p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="w-full bg-secondary/50 border border-border/40 rounded-xl px-4 py-3 font-mono text-lg tracking-[0.3em] text-center text-white uppercase"
            />
            <button
              onClick={() => joinLobby(joinCode, profile.name, settings.accentColor)}
              disabled={joinCode.length < 4 || busy}
              className="w-full py-3 rounded-xl bg-secondary/60 border border-border/40 font-semibold text-sm disabled:opacity-40"
            >
              Join
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-auto">
            Derez Legacy wins: <span className="font-mono text-white">{scores['legacy-derez']}</span>
          </p>
        </div>
      </div>
    );
  }

  // ---- Arena drawing overlay -------------------------------------------
  if (drawing) {
    return (
      <DerezArenaDrawer
        initialRing={lobby.arena?.ring ?? null}
        accentColor={accent}
        onCancel={() => setDrawing(false)}
        onConfirm={(ring) => { setArena({ ring }); setDrawing(false); }}
      />
    );
  }

  // ---- Live round --------------------------------------------------------
  if ((lobby.state === 'live' || lobby.state === 'countdown') && me) {
    return (
      <div className="min-h-dvh bg-black flex flex-col safe-top safe-bottom">
        {lobby.state === 'countdown' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="font-mono text-xs tracking-widest uppercase text-white/50">Derez in</p>
            <p className="font-mono text-8xl font-bold tabular-nums" style={{ color: accent, textShadow: `0 0 30px ${accent}` }}>
              {countdown ?? 5}
            </p>
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/40">Stay inside the grid</p>
          </div>
        ) : (
          <DerezGameView lobby={lobby} players={players} me={me} onDeath={reportDeath} />
        )}
      </div>
    );
  }

  // ---- Winner screen -----------------------------------------------------
  if (lobby.state === 'finished') {
    const winner = players.find(p => p.userId === lobby.winnerId);
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-6 p-6 safe-top safe-bottom">
        <Trophy className="w-10 h-10" style={{ color: winner ? colorOf(winner.accentColor) : accent }} />
        <div className="text-center">
          <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
            {winner ? 'Winner' : 'Everyone derezzed'}
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: winner ? colorOf(winner.accentColor) : undefined }}>
            {lobby.winnerName ?? 'Draw'}
          </p>
          {winner && <p className="text-xs text-muted-foreground mt-1">{winner.livesLeft} lives remaining</p>}
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-border/30 bg-card/50 p-4 space-y-2">
          {players.map(p => (
            <div key={p.userId} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(p.accentColor) }} />
                {p.displayName}
              </span>
              <span className="font-mono text-muted-foreground">{p.livesLeft} left</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 w-full max-w-sm">
          {isLeader && (
            <button
              onClick={resetToLobby}
              className="flex-1 py-3.5 rounded-xl border-2 font-semibold text-sm"
              style={{ borderColor: accent, color: accent }}
            >
              Reset
            </button>
          )}
          <button onClick={exit} className="flex-1 py-3.5 rounded-xl bg-secondary/60 border border-border/40 font-semibold text-sm">
            Arcade
          </button>
        </div>
        {!isLeader && <p className="text-xs text-muted-foreground">Waiting for the leader to reset…</p>}
      </div>
    );
  }

  // ---- Lobby -------------------------------------------------------------
  return (
    <div className="min-h-dvh bg-background flex flex-col safe-top safe-bottom">
      <Header title="Derez Legacy" onBack={exit} />

      <div className="flex-1 px-4 pb-6 space-y-4 overflow-y-auto">
        {/* Code + QR */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Lobby code</p>
            <p className="font-mono text-2xl tracking-[0.25em] text-white">{lobby.code}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Scan or share the code to bring riders in.</p>
          </div>
          <div className="bg-white p-2 rounded-xl">
            <QRCodeSVG value={joinUrl} size={78} />
          </div>
        </div>

        {/* Players */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Riders {players.length}/8</p>
          </div>
          <div className="space-y-2">
            {players.map(p => (
              <div key={p.userId} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-white">
                  <span className="w-3 h-3 rounded-full" style={{ background: colorOf(p.accentColor) }} />
                  {p.displayName}
                  {p.userId === lobby.leaderId && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                </span>
                {p.isReady
                  ? <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald-400"><Check className="w-3 h-3" /> Ready</span>
                  : <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Waiting</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Arena */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Arena</p>
          </div>
          <p className="text-sm text-white">
            {arenaArea > 0 ? `${arenaArea.toLocaleString()} m² grid set` : 'No grid drawn yet'}
          </p>
          {isLeader && (
            <button
              onClick={() => setDrawing(true)}
              className="w-full py-3 rounded-xl border-2 font-semibold text-sm"
              style={{ borderColor: accent, color: accent }}
            >
              {arenaArea > 0 ? 'Redraw arena' : 'Draw arena'}
            </button>
          )}
        </div>

        {/* Lives */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Lives per rider</p>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                disabled={!isLeader}
                onClick={() => setLives(n)}
                className="flex-1 py-2.5 rounded-xl border font-mono text-sm disabled:opacity-60"
                style={lobby.lives === n
                  ? { borderColor: accent, color: accent, background: `${accent.replace('hsl(', 'hsla(').replace(')', ', 0.12)')}` }
                  : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 space-y-2">
        <button
          onClick={() => setReady(!me?.isReady)}
          className="w-full py-4 rounded-2xl border-2 font-semibold text-sm"
          style={me?.isReady
            ? { borderColor: accent, background: accent, color: '#000' }
            : { borderColor: accent, color: accent }}
        >
          {me?.isReady ? 'Ready ✓' : 'Ready up'}
        </button>

        {isLeader && (
          <button
            onClick={startCountdown}
            disabled={!allReady || arenaArea === 0}
            className="w-full py-4 rounded-2xl bg-secondary/60 border border-border/40 font-semibold text-sm disabled:opacity-40"
          >
            {arenaArea === 0 ? 'Draw an arena first' : allReady ? 'Start round' : 'Waiting for riders…'}
          </button>
        )}

        <button onClick={exit} className="w-full py-3 rounded-xl text-xs text-muted-foreground flex items-center justify-center gap-2">
          <LogOut className="w-3.5 h-3.5" /> Leave lobby
        </button>
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="relative flex items-center justify-center px-4 pt-4 pb-3 flex-shrink-0">
      <button
        onClick={onBack}
        className="absolute left-4 top-3.5 p-2.5 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
        aria-label="Back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h1 className="text-lg font-bold tracking-tight text-white">{title}</h1>
    </header>
  );
}
