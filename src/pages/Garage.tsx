import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, Trash2, Check, Move, X, BookDown } from 'lucide-react';
import { LogbookCover, LogbookView, LogbookReceiver } from '@/features/logbook';
import { DEFAULT_BIKE_PLACEMENT, BikePlacement } from '@/features/garage/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BTLogo } from '@/components/BTLogo';
import {
  useGarage,
  useBikeStats,
  GarageDiorama,
  BikePhotoCapture,
  StatsPanel,
  MaintenanceList,
} from '@/features/garage';
import { BikePhotos, type Bike } from '@/features/garage';
import { buildNickLines } from '@/features/garage/lib/nickLines';
import { toast } from 'sonner';
import { useSettings } from '@/features/settings';
import { useExperience } from '@/features/experience';
import { HeaderButton } from '@/components/PageHeader';


import { tr, lowerName } from '@/lib/i18n';

export default function Garage() {
  const navigate = useNavigate();
  const {
    bikes,
    activeBike,
    activeBikeId,
    setActiveBike,
    addBike,
    updateBike,
    deleteBike,
  } = useGarage();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState<BikePhotos | null>(null);
  const [placing, setPlacing] = useState(false);
  const [draftPlacement, setDraftPlacement] = useState<BikePlacement | null>(null);
  // Snapshot of the vehicle whose logbook is open: it stays open (showing the
  // hand-over result) even after a hand-over removes the vehicle.
  const [logbookBike, setLogbookBike] = useState<Bike | null>(null);
  // The logbook scanner lives outside the Add dialog so closing the dialog
  // doesn't unmount it mid-scan; the dialog's button just opens it.
  const openReceiverRef = useRef<(() => void) | null>(null);

  const stats = useBikeStats(activeBike);

  const tip = useMemo(() => {
    if (!activeBike) return tr("Add your first vehicle, partner.");
    const over = activeBike.maintenance.find(
      (m) => stats.odometerKm >= m.lastServiceKm + m.intervalKm,
    );
    if (over) return tr("Hey — your {0} is overdue. Knock it out.", [lowerName(over.name)]);
    const due = activeBike.maintenance
      .map((m) => ({ m, dueIn: m.lastServiceKm + m.intervalKm - stats.odometerKm }))
      .filter((x) => x.dueIn > 0 && x.dueIn <= 200)
      .sort((a, b) => a.dueIn - b.dueIn)[0];
    if (due) return tr("Heads up — {0} due in {1} km.", [lowerName(due.m.name), Math.round(due.dueIn)]);
    return null;
  }, [activeBike, stats.odometerKm]);

  const exp = useExperience();
  const { settings } = useSettings();
  const nickCtx = {
    vehicle: exp.primary.id,
    speed: settings.speedFocusEnabled,
    lean: exp.canLean && settings.leanAngleEnabled,
    g: settings.gForceEnabled,
    ride: exp.terms.ride,
    rides: exp.terms.rides,
  };
  const nickKey = JSON.stringify(nickCtx);
  const nickLines = useMemo(() => buildNickLines(activeBike, stats, nickCtx), [activeBike, stats, nickKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = activeBikeId ? bikes.findIndex((b) => b.id === activeBikeId) : -1;
  const cycle = (dir: 1 | -1) => {
    if (bikes.length < 2) return;
    const next = (idx + dir + bikes.length) % bikes.length;
    setActiveBike(bikes[next].id);
  };

  const resetAddForm = () => {
    setName('');
    setPhotos(null);
  };

  const handleAddSavePhotos = (p: BikePhotos) => {
    setPhotos(p);
  };

  const completeAdd = (readyPhotos = photos) => {
    if (!name.trim() || !readyPhotos?.hero) {
      toast.error(tr("Name and image required"));
      return;
    }
    addBike({
      name: name.trim(),
      photos: readyPhotos,
      baseOdometerKm: 0,
    });
    toast.success(tr("Vehicle added to the garage"));
    setAddOpen(false);
    resetAddForm();
  };

  // The logbook takes over the whole screen while it's open.
  if (logbookBike) {
    const live = bikes.find((b) => b.id === logbookBike.id) ?? logbookBike;
    return <LogbookView bike={live} onBack={() => setLogbookBike(null)} />;
  }

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom">
      <LogbookReceiver
        trigger={(open) => {
          openReceiverRef.current = open;
          return null;
        }}
      />
      <header className="flex items-center gap-3 mb-4">
        <HeaderButton onClick={() => navigate('/')} aria-label={tr("Back")}>
          <ChevronLeft className="w-5 h-5 -ml-0.5" strokeWidth={2.25} />
        </HeaderButton>
        <h1 className="flex-1 text-[22px] font-semibold tracking-[-0.025em] leading-tight">{tr("Garage")}</h1>
        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm(); }}>
          <DialogTrigger asChild>
            <HeaderButton active aria-label={tr("Add vehicle")}>
              <Plus className="w-5 h-5" />
            </HeaderButton>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{tr("Add a vehicle")}</DialogTitle>
            </DialogHeader>
            {!photos ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{tr("Vehicle name *")}</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("My ride")} />
                </div>
                <Button
                  onClick={() => name.trim() && setPhotos({} as BikePhotos)}
                  disabled={!name.trim()}
                  className="w-full"
                >
                  {tr("Continue to image")}
                </Button>
                {/* Taking over someone else's vehicle: pull in its logbook instead */}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setAddOpen(false);
                    resetAddForm();
                    openReceiverRef.current?.();
                  }}
                >
                  <BookDown className="w-4 h-4" />{" "}{tr("Scan new logbook")}
                </Button>
              </div>
            ) : (
              <BikePhotoCapture
                initial={photos as Partial<BikePhotos>}
                onComplete={(p) => {
                  handleAddSavePhotos(p);
                  completeAdd(p);
                }}
                onCancel={() => setPhotos(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </header>


      {bikes.length > 0 && activeBike && (
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            onClick={() => cycle(-1)}
            disabled={bikes.length < 2}
            className="h-8 w-8 rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-secondary"
            aria-label={tr("Previous vehicle")}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-0">
            <p className="font-semibold tracking-tight truncate">{activeBike.name}</p>
            {bikes.length > 1 && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {idx + 1} / {bikes.length}
              </p>
            )}
          </div>
          <button
            onClick={() => cycle(1)}
            disabled={bikes.length < 2}
            className="h-8 w-8 rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-secondary"
            aria-label={tr("Next vehicle")}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {placing && activeBike && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2">
          <p className="text-xs text-foreground/80">{tr("Drag the vehicle & use the slider to resize.")}</p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs gap-1"
              onClick={() => { setPlacing(false); setDraftPlacement(null); }}
            >
              <X className="w-3.5 h-3.5" />{" "}{tr("Cancel")}
            </Button>
            <Button
              size="sm"
              className="h-8 px-2 text-xs gap-1"
              onClick={() => {
                updateBike(activeBike.id, { placement: draftPlacement ?? activeBike.placement ?? DEFAULT_BIKE_PLACEMENT });
                setPlacing(false);
                setDraftPlacement(null);
                toast.success(tr("Placement saved"));
              }}
            >
              <Check className="w-3.5 h-3.5" />{" "}{tr("Confirm")}
            </Button>
          </div>
        </div>
      )}

      <GarageDiorama
        bike={activeBike}
        tip={placing ? null : tip}
        nickLines={nickLines}
        editing={placing}
        onPlacementChange={setDraftPlacement}
      />

      {activeBike && !placing && (
        <div className="mt-2 flex justify-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3 text-xs gap-1"
            onClick={() => { setDraftPlacement(activeBike.placement ?? DEFAULT_BIKE_PLACEMENT); setPlacing(true); }}
          >
            <Move className="w-3.5 h-3.5" />{" "}{tr("Adjust placement")}
          </Button>
        </div>
      )}

      {!activeBike ? (
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <div>
            <p className="text-muted-foreground mb-4">{tr("Your garage is empty.")}</p>
            <Button onClick={() => setAddOpen(true)} className="gap-1">
              <Plus className="w-4 h-4" />{" "}{tr("Add a vehicle")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex-1 min-h-0">
          <Tabs defaultValue="stats" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="stats">{tr("Stats")}</TabsTrigger>
              <TabsTrigger value="maint">{tr("Maintenance")}</TabsTrigger>
            </TabsList>
            <TabsContent value="stats" className="mt-3">
              <StatsPanel stats={stats} baseOdometerKm={activeBike.baseOdometerKm} />
            </TabsContent>
            <TabsContent value="maint" className="mt-3">
              <MaintenanceList bike={activeBike} odometerKm={stats.odometerKm} />
            </TabsContent>
          </Tabs>

          <div className="mt-4 pt-3 border-t border-border/30 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  {tr("Rename / replace image")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tr("Edit vehicle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">{tr("Vehicle name")}</label>
                    <Input
                      defaultValue={activeBike.name}
                      onBlur={(e) => updateBike(activeBike.id, { name: e.target.value })}
                    />
                  </div>
                  <BikePhotoCapture
                    initial={activeBike.photos}
                    onComplete={(p) => {
                      updateBike(activeBike.id, { photos: p });
                      toast.success(tr("Image updated"));
                      setEditOpen(false);
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs text-destructive gap-1">
                  <Trash2 className="w-3.5 h-3.5" />{" "}{tr("Remove vehicle")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tr("Remove")}{" "}{activeBike.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tr("Past rides keep their distance, but stop counting toward this vehicle. Cannot be undone.")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      deleteBike(activeBike.id);
                      toast.success(tr("Vehicle removed"));
                    }}
                  >
                    {tr("Remove")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Logbook: every ride, stat and service for this vehicle; hand-over lives at the back */}
          <div className="mt-6 mb-4">
            <LogbookCover vehicleName={activeBike.name} onOpen={() => setLogbookBike(activeBike)} />
            <p className="mt-3 text-center text-[11px] text-muted-foreground">{tr("Tap the logbook to open it")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
