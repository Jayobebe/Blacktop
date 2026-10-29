import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Film, Map as MapIcon, Layers, Radio, Mic, Archive, Trash2, ShieldCheck, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { useDemoMode } from '@/lib/demoMode';
import { listRideOverlays, deleteRideOverlayBlob } from '@/lib/overlayStore';
import { bytesText, localStorageBytes, requestPersist, storageEstimate, storagePersisted } from '@/lib/storageEstimate';
import { usePilotVoice, removePilotVoice } from '@/lib/pilotVoice';
import { tileCacheSizes, clearTileCache } from '@/features/map/lib/tileCache';
import { clearSpeedCells, speedCellBytes } from '@/lib/speedCellStore';
import { listPacks, deletePack, type OfflinePack } from '@/features/map/lib/offlinePacks';
import { useSavedRoutes } from '@/features/map/lib/savedRoutes';
import { useRadioStations, deleteStation } from '@/features/radio';
import { useRideHistory, getActiveRideStatus } from '@/features/ride';
import { PageTips } from '@/features/guide';
import { PixelLoader } from '@/components/PixelLoader';

const DAY = 86_400_000;
type Cat = 'videos' | 'packs' | 'cache' | 'radio' | 'voice' | 'data';
const COLOR: Record<Cat, string> = {
  videos: 'hsl(330 80% 65%)',
  packs: 'hsl(212 80% 66%)',
  cache: 'hsl(190 55% 52%)',
  radio: 'hsl(38 92% 55%)',
  voice: 'hsl(265 70% 72%)',
  data: 'hsl(150 55% 50%)',
};

interface Ask {
  title: string;
  body: string;
  run: () => Promise<void>;
}

/**
 * Storage (Settings → Privacy, and Blacktop Console): what Blacktop keeps on
 * the phone, by kind, each with its own way to clear it. Sizes per kind are
 * Blacktop's own count; the total and the room left are the browser's estimate.
 * Nothing on the server is here (it costs the phone nothing). Every clear-out
 * asks first and names what goes; none during a ride or in demo mode.
 */
export default function StoragePage() {
  const navigate = useNavigate();
  const { enabled: demo } = useDemoMode();
  const { rides, clearRideOverlay } = useRideHistory();
  const { stations } = useRadioStations();
  const voice = usePilotVoice();
  const savedRoutes = useSavedRoutes();
  const [videos, setVideos] = useState<Array<{ rideId: string; size: number; createdAt: number }>>([]);
  const [packs, setPacks] = useState<OfflinePack[]>([]);
  const [tiles, setTiles] = useState({ cache: 0, pinned: 0 });
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [kept, setKept] = useState<boolean | null>(null);
  const [data, setData] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const [v, t, e, k, sc] = await Promise.all([listRideOverlays(), tileCacheSizes(), storageEstimate(), storagePersisted(), speedCellBytes()]);
    setVideos(v.sort((a, b) => b.createdAt - a.createdAt));
    // The speed-limit map's cells count as map cache: kept from riding, fetched again as needed.
    setTiles({ ...t, cache: t.cache + sc });
    setEst(e);
    setKept(k);
    setPacks(listPacks());
    setData(localStorageBytes());
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const radioBytes = (s: (typeof stations)[number]) => s.tracks.reduce((n, t) => n + (t.file?.size ?? 0), 0);
  const sizes: Record<Cat, number> = {
    videos: videos.reduce((n, v) => n + v.size, 0),
    packs: Math.max(tiles.pinned, packs.reduce((n, p) => n + (p.bytes || 0), 0)),
    cache: tiles.cache,
    radio: stations.reduce((n, s) => n + radioBytes(s), 0),
    voice: voice.status === 'installed' ? voice.bytes : 0,
    data,
  };
  const counted = Object.values(sizes).reduce((a, b) => a + b, 0);
  const usage = Math.max(est?.usage ?? 0, counted);
  const quota = est?.quota ?? 0;

  // Not mid-ride (a clear-out under a running recording or a guided map), not in demo mode.
  const blocked = demo || getActiveRideStatus().isActive;
  const confirm = (a: Ask) => {
    if (demo) return;
    if (getActiveRideStatus().isActive) return void toast.error(tr("End your ride to clear space."));
    setAsk(a);
  };
  const run = async () => {
    if (!ask) return;
    setWorking(true);
    try {
      await ask.run();
      toast.success(tr("Space cleared"));
    } catch {
      toast.error(tr("Couldn't clear that. Try again."));
    } finally {
      setWorking(false);
      setAsk(null);
      void load();
    }
  };

  const rideName = (id: string) => {
    const r = rides.find((x) => x.id === id);
    if (!r) return tr("A ride no longer in History");
    return r.name || new Date(r.startedAt).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const dateText = (at: number) => new Date(at).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const oldVideos = videos.filter((v) => Date.now() - v.createdAt > 30 * DAY);
  const routeFor = useMemo(() => new Map(savedRoutes.filter((r) => r.packId).map((r) => [r.packId!, r.name])), [savedRoutes]);

  const deleteVideos = (list: typeof videos) =>
    confirm({
      title: list.length === 1 ? tr("Delete this video ({0})?", [bytesText(list[0].size)]) : tr("Delete {0} videos ({1})?", [list.length, bytesText(list.reduce((n, v) => n + v.size, 0))]),
      body: tr("The overlay video goes from this phone. The ride itself stays in History."),
      run: async () => {
        for (const v of list) {
          await deleteRideOverlayBlob(v.rideId);
          clearRideOverlay(v.rideId);
        }
      },
    });

  return (
    <div className="min-h-dvh px-4 pt-4 pb-10 safe-top safe-bottom md:px-5">
      <PageHeader title={tr("Storage")} subtitle={tr("What Blacktop keeps on this phone")} />

      {/* The room the phone gives Blacktop, split by kind. */}
      <section className="rounded-2xl frost border border-border/60 p-4 mb-4">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><PixelLoader className="w-4 h-4" /> {tr("Counting…")}</p>
        ) : (
          <>
            <div className="h-3 rounded-full overflow-hidden flex bg-background/70 border border-border/50" aria-hidden>
              {(Object.keys(sizes) as Cat[]).map((c) => (
                <span key={c} style={{ width: quota ? `${(sizes[c] / quota) * 100}%` : '0%', backgroundColor: COLOR[c], minWidth: sizes[c] > 0 ? 2 : 0 }} />
              ))}
              {quota > 0 && usage > counted && <span style={{ width: `${((usage - counted) / quota) * 100}%` }} className="bg-muted-foreground/40" />}
            </div>
            <p className="mt-2 text-sm">
              {quota > 0
                ? tr("Blacktop is using {0} of about {1}", [bytesText(usage), bytesText(quota)])
                : tr("Blacktop is using about {0}", [bytesText(usage)])}
            </p>
            {quota > 0 && <p className="text-xs text-muted-foreground">{tr("{0} free for Blacktop", [bytesText(Math.max(0, quota - usage))])}</p>}
            <p className="mt-2 text-[10px] text-muted-foreground/80">{tr("The total is your browser's estimate; each kind below is counted exactly.")}</p>
          </>
        )}
        {blocked && <p className="mt-3 text-xs text-muted-foreground">{demo ? tr("Clearing space is off in demo mode.") : tr("End your ride to clear space.")}</p>}
      </section>

      <div className="space-y-3">
        <Row cat="videos" Icon={Film} title={tr("Overlay videos")} size={sizes.videos} text={tr("Each ride's recorded overlay video, until you download or share it.")}>
          {videos.length > 0 && (
            <>
              <ul className="mt-2 divide-y divide-border/40">
                {videos.map((v) => (
                  <li key={v.rideId} className="py-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{rideName(v.rideId)}</span>
                      <span className="block text-[11px] text-muted-foreground">{dateText(v.createdAt)} · {bytesText(v.size)}</span>
                    </span>
                    <DeleteButton disabled={blocked} label={tr("Delete")} onClick={() => deleteVideos([v])} />
                  </li>
                ))}
              </ul>
              {oldVideos.length > 0 && (
                <Button variant="outline" size="sm" disabled={blocked} onClick={() => deleteVideos(oldVideos)} className="mt-2 w-full h-11 rounded-xl text-xs">
                  {tr("Delete videos older than 30 days ({0})", [oldVideos.length])}
                </Button>
              )}
            </>
          )}
        </Row>

        <Row cat="packs" Icon={MapIcon} title={tr("Offline maps")} size={sizes.packs} text={tr("Map areas you downloaded, and the maps saved with your routes.")}>
          {packs.length > 0 && (
            <ul className="mt-2 divide-y divide-border/40">
              {packs.map((p) => (
                <li key={p.id} className="py-2 flex items-center gap-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{p.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {routeFor.has(p.id) ? tr("Saved route: {0}", [routeFor.get(p.id)!]) : dateText(Date.parse(p.createdAt))} · {bytesText(p.bytes || 0)}
                    </span>
                  </span>
                  <DeleteButton
                    disabled={blocked}
                    label={tr("Delete")}
                    onClick={() =>
                      confirm({
                        title: tr("Delete {0} ({1})?", [p.name, bytesText(p.bytes || 0)]),
                        body: routeFor.has(p.id) ? tr("The route stays saved; its map loads online again.") : tr("This area won't be on the map offline any more."),
                        run: () => deletePack(p.id),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Row>

        <Row cat="cache" Icon={Layers} title={tr("Map cache")} size={sizes.cache} text={tr("Map tiles and speed limits kept from riding, so the map loads faster. It fills up again as you ride.")}>
          {sizes.cache > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={blocked}
              onClick={() => confirm({ title: tr("Clear the map cache ({0})?", [bytesText(sizes.cache)]), body: tr("Offline maps aren't touched."), run: () => Promise.all([clearTileCache(), clearSpeedCells()]).then(() => undefined) })}
              className="mt-2 w-full h-11 rounded-xl text-xs"
            >
              {tr("Clear the map cache")}
            </Button>
          )}
        </Row>

        <Row cat="radio" Icon={Radio} title={tr("Blacktop Radio")} size={sizes.radio} text={tr("Music copied into your stations. A folder station plays from the folder and takes no room.")}>
          {stations.some((s) => radioBytes(s) > 0) && (
            <ul className="mt-2 divide-y divide-border/40">
              {stations
                .filter((s) => radioBytes(s) > 0)
                .map((s) => (
                  <li key={s.id} className="py-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{s.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{tr("{0} tracks", [s.tracks.length])} · {bytesText(radioBytes(s))}</span>
                    </span>
                    <DeleteButton
                      disabled={blocked}
                      label={tr("Delete")}
                      onClick={() => confirm({ title: tr("Delete {0} ({1})?", [s.name, bytesText(radioBytes(s))]), body: tr("The station and its music go from this phone. Your own files elsewhere aren't touched."), run: () => deleteStation(s.id) })}
                    />
                  </li>
                ))}
            </ul>
          )}
        </Row>

        <Row cat="voice" Icon={Mic} title={tr("Pilot voice")} size={sizes.voice} text={tr("The downloaded radio voice. Without it, the phone's own voice speaks.")}>
          {voice.status === 'installed' && (
            <Button
              variant="outline"
              size="sm"
              disabled={blocked}
              onClick={() => confirm({ title: tr("Remove the pilot voice ({0})?", [bytesText(sizes.voice)]), body: tr("You can download it again in Settings."), run: removePilotVoice })}
              className="mt-2 w-full h-11 rounded-xl text-xs"
            >
              {tr("Remove the pilot voice")}
            </Button>
          )}
        </Row>

        <Row cat="data" Icon={Archive} title={tr("Rides and everything else")} size={sizes.data} text={tr("Rides, garage, logbook, cards, calendar and settings: what a backup carries. Small, and not cleared from here.")}>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')} className="h-11 rounded-xl text-xs">{tr("Back up this phone")}</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/history')} className="h-11 rounded-xl text-xs">{tr("Burn trips")}</Button>
          </div>
        </Row>

        {/* Keep it: asks the browser not to clear Blacktop when the phone runs low. */}
        {kept !== null && (
          <label data-tip="storage-keep" className="flex items-center gap-3 rounded-2xl frost border border-border/60 p-4">
            <ShieldCheck className={cn('w-5 h-5 shrink-0', kept ? 'text-accent' : 'text-muted-foreground')} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{tr("Keep Blacktop's storage")}</span>
              <span className="block text-[11px] text-muted-foreground">
                {kept ? tr("Your browser won't clear it when the phone runs low.") : tr("Ask your browser not to clear it when the phone runs low.")}
              </span>
            </span>
            <Switch
              checked={kept}
              disabled={kept}
              onCheckedChange={async (on) => {
                if (!on) return;
                const ok = await requestPersist();
                setKept(ok);
                if (!ok) toast(tr("Your browser said no for now. Installing Blacktop to your home screen usually lets it say yes."));
              }}
            />
          </label>
        )}
      </div>

      <PageTips
        page="storage"
        scroll
        when={!loading && !ask}
        tips={[{ target: '[data-tip="storage-keep"]', text: tr("Turn this on so the phone never clears Blacktop on its own to make room.") }]}
      />
      <AlertDialog open={!!ask} onOpenChange={(o) => !o && !working && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
            <AlertDialogDescription>{ask?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={(e) => { e.preventDefault(); void run(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {working ? <PixelLoader className="w-4 h-4" /> : tr("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ cat, Icon, title, size, text, children }: { cat: Cat; Icon: LucideIcon; title: string; size: number; text: string; children?: ReactNode }) {
  return (
    <section className="rounded-2xl frost border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${COLOR[cat]} 18%, transparent)`, color: COLOR[cat] }}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{title}</span>
            <span className="font-mono text-sm shrink-0">{size > 0 ? bytesText(size) : tr("Nothing")}</span>
          </span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">{text}</span>
        </span>
      </div>
      {children}
    </section>
  );
}

function DeleteButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="glove-hit h-9 w-9 rounded-xl frost-accent flex items-center justify-center shrink-0 disabled:opacity-40">
      <Trash2 className="w-4 h-4 text-destructive" />
    </button>
  );
}
