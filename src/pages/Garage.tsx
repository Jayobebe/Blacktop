import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronLeft, ChevronRight, Trash2, Check } from 'lucide-react';
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
import { BikePhotos } from '@/features/garage';
import { toast } from 'sonner';

const KM_TO_MI = 1 / 1.60934;

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

  const stats = useBikeStats(activeBike);

  const tip = useMemo(() => {
    if (!activeBike) return 'Add your first vehicle, partner.';
    const over = activeBike.maintenance.find(
      (m) => stats.odometerKm >= m.lastServiceKm + m.intervalKm,
    );
    if (over) return `Hey — your ${over.name.toLowerCase()} is overdue. Knock it out.`;
    const due = activeBike.maintenance
      .map((m) => ({ m, dueIn: m.lastServiceKm + m.intervalKm - stats.odometerKm }))
      .filter((x) => x.dueIn > 0 && x.dueIn <= 200)
      .sort((a, b) => a.dueIn - b.dueIn)[0];
    if (due) return `Heads up — ${due.m.name.toLowerCase()} due in ${Math.round(due.dueIn)} km.`;
    return null;
  }, [activeBike, stats.odometerKm]);

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
      toast.error('Name and image required');
      return;
    }
    addBike({
      name: name.trim(),
      photos: readyPhotos,
      baseOdometerKm: 0,
    });
    toast.success('Vehicle added to the garage');
    setAddOpen(false);
    resetAddForm();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col p-4 safe-top safe-bottom">
      <header className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigate('/')}
          className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-secondary touch-target"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <BTLogo size="sm" />
          <h1 className="text-lg font-semibold tracking-tight">Garage</h1>
        </div>
        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm(); }}>
          <DialogTrigger asChild>
            <button
              className="h-10 w-10 rounded-xl flex items-center justify-center bg-accent/10 text-accent hover:bg-accent/20 touch-target"
              aria-label="Add bike"
            >
              <Plus className="w-5 h-5" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a bike</DialogTitle>
            </DialogHeader>
            {!photos ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My ride" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Make / Model</label>
                  <Input
                    value={makeModel}
                    onChange={(e) => setMakeModel(e.target.value)}
                    placeholder="Yamaha MT-07"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Odometer (km)</label>
                  <Input
                    type="number"
                    min={0}
                    value={odo}
                    onChange={(e) => setOdo(Number(e.target.value))}
                  />
                </div>
                <Button
                  onClick={() => name.trim() && setPhotos({} as BikePhotos)}
                  disabled={!name.trim()}
                  className="w-full"
                >
                  Continue to photos
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
            aria-label="Previous bike"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-0">
            <p className="font-semibold tracking-tight truncate">{activeBike.name}</p>
            {activeBike.makeModel && (
              <p className="text-xs text-muted-foreground truncate">{activeBike.makeModel}</p>
            )}
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
            aria-label="Next bike"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <GarageDiorama bike={activeBike} tip={tip} />

      {!activeBike ? (
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <div>
            <p className="text-muted-foreground mb-4">Your garage is empty.</p>
            <Button onClick={() => setAddOpen(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Add a bike
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex-1 min-h-0">
          <Tabs defaultValue="stats" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="maint">Maintenance</TabsTrigger>
            </TabsList>
            <TabsContent value="stats" className="mt-3">
              <StatsPanel stats={stats} baseOdometerKm={activeBike.baseOdometerKm} />
            </TabsContent>
            <TabsContent value="maint" className="mt-3">
              <MaintenanceList bike={activeBike} odometerKm={stats.odometerKm} />
            </TabsContent>
          </Tabs>

          <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  Rename / re-shoot
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit bike</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input
                      defaultValue={activeBike.name}
                      onBlur={(e) => updateBike(activeBike.id, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Make / Model</label>
                    <Input
                      defaultValue={activeBike.makeModel || ''}
                      onBlur={(e) => updateBike(activeBike.id, { makeModel: e.target.value })}
                    />
                  </div>
                  <BikePhotoCapture
                    initial={activeBike.photos}
                    onComplete={(p) => {
                      updateBike(activeBike.id, { photos: p });
                      toast.success('Photos updated');
                      setEditOpen(false);
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs text-destructive gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> Remove bike
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {activeBike.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Past rides keep their distance, but stop counting toward this bike. Cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      deleteBike(activeBike.id);
                      toast.success('Bike removed');
                    }}
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}
