import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRideHistory, burnExpiredTrips, type BurnTripsInterval } from '@/features/ride';
import { useSettings } from '@/features/settings';
import { useGarage } from '@/features/garage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Users, User, Clock, Route, Pencil, Star, Flame, ChevronDown, Trophy, Timer, Disc3 as BikeIcon } from 'lucide-react';
import { formatDuration, formatDistance, formatDate, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useExperience } from '@/features/experience';
import { PageHeader } from '@/components/PageHeader';

const BURN_LABELS: Record<BurnTripsInterval, string> = {
  off: 'Off',
  week: 'Every week',
  month: 'Every month',
};

export default function History() {
  const navigate = useNavigate();
  const { rides, updateRideName, updateRideBike, toggleRideStarred } = useRideHistory();
  const { settings, updateSetting } = useSettings();
  const { terms, showGroup } = useExperience();
  const { bikes } = useGarage();
  const [editingRideId, setEditingRideId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingRideId && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingRideId]);

  const handleEditStart = (rideId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRideId(rideId);
    setEditedName(currentName);
  };

  const handleNameSave = (rideId: string) => {
    updateRideName(rideId, editedName);
    setEditingRideId(null);
  };

  const handleBurnChange = (value: string) => {
    const interval = value as BurnTripsInterval;
    updateSetting('burnTripsInterval', interval);
    if (interval === 'off') {
      toast('Burn trips off', { description: `${terms.Rides} stay until you delete them.` });
      return;
    }
    const burned = burnExpiredTrips(interval);
    const age = interval === 'week' ? 'a week' : 'a month';
    toast.success(`Burning unstarred ${terms.rides} older than ${age}`, {
      description: burned > 0
        ? `${burned} burned now. Your totals and stats are kept.`
        : 'Star a ride to keep it. Your totals and stats are kept.',
    });
  };

  const handleNameKeyDown = (e: React.KeyboardEvent, rideId: string) => {
    if (e.key === 'Enter') {
      handleNameSave(rideId);
    } else if (e.key === 'Escape') {
      setEditingRideId(null);
    }
  };

  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <PageHeader
        title={`${terms.Ride} History`}
        subtitle={`${rides.length} ${rides.length === 1 ? terms.ride : terms.rides} recorded`}
        backTo="/"
        right={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'pressable h-10 px-3.5 rounded-full flex items-center gap-1.5 frost-accent text-[13px] font-medium',
                  settings.burnTripsInterval !== 'off' ? 'text-[hsl(var(--burn))]' : 'text-foreground',
                )}
                aria-label={`Burn trips: ${BURN_LABELS[settings.burnTripsInterval]}`}
              >
                <Flame className="w-4 h-4" />
                Burn trips
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Unstarred {terms.rides} are wiped to save storage. Totals and stats stay.
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={settings.burnTripsInterval} onValueChange={handleBurnChange}>
                <DropdownMenuRadioItem value="week">{BURN_LABELS.week}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="month">{BURN_LABELS.month}</DropdownMenuRadioItem>
                <DropdownMenuSeparator />
                <DropdownMenuRadioItem value="off">{BURN_LABELS.off}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Rides List */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 landscape:space-y-2 pr-1">
        {rides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 landscape:py-8 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-card/50 border border-border/30 flex items-center justify-center mb-4">
              <Route className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground font-medium">No {terms.rides} yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Start your first {terms.ride} to see it here</p>
          </div>
        ) : (
          rides.map((ride, index) => {
            const isLatest = index === 0;
            const displayName = ride.name || formatDate(ride.startedAt);
            const hasBadges = settings.collectiblesEnabled && ride.earnedBadges && ride.earnedBadges.length > 0;
            return (
              <button
                key={ride.id}
                onClick={() => navigate(`/ride/${ride.id}`)}
                className={cn(
                  "pressable w-full bg-card border rounded-[20px] p-4 landscape:p-3 text-left hover:bg-secondary/60 transition-colors animate-slide-up touch-target",
                  isLatest ? "border-accent/35" : "border-white/[0.06]"
                )}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className={cn("flex items-start justify-between", settings.speedFocusEnabled && "mb-2 landscape:mb-1.5")}>
                  <div className="flex-1 min-w-0">
                    {editingRideId === ride.id ? (
                      <Input
                        ref={nameInputRef}
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={() => handleNameSave(ride.id)}
                        onKeyDown={(e) => handleNameKeyDown(e, ride.id)}
                        onClick={(e) => e.stopPropagation()}
                        maxLength={30}
                        className="h-8 text-sm font-medium rounded-xl"
                        placeholder={`${terms.Ride} name`}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{displayName}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRideStarred(ride.id);
                          }}
                          className={cn(
                            "p-1.5 rounded-lg hover:bg-white/[0.07] transition-colors",
                            ride.starred ? "text-accent" : "text-muted-foreground hover:text-foreground",
                          )}
                          aria-label={ride.starred ? "Unstar" : "Star to keep"}
                          aria-pressed={!!ride.starred}
                        >
                          <Star className={cn("w-3.5 h-3.5", ride.starred && "fill-current")} />
                        </button>
                        <button
                          onClick={(e) => handleEditStart(ride.id, ride.name || '', e)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.07] transition-colors"
                          aria-label="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {ride.isConvoyRide ? (
                        <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-lg font-medium">
                          <Users className="w-2.5 h-2.5" />
                          Convoy
                        </span>
                      ) : showGroup ? (
                        // Solo-only riders don't need every card labelled "Solo".
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-lg font-medium">
                          <User className="w-2.5 h-2.5" />
                          Solo
                        </span>
                      ) : null}
                      {ride.challenge && (
                        <span className="flex items-center gap-1 text-[10px] text-[hsl(330_81%_60%)] bg-[hsl(330_81%_60%)]/10 px-2 py-0.5 rounded-lg font-medium">
                          <Timer className="w-2.5 h-2.5" />
                          Time attack
                        </span>
                      )}
                      {hasBadges && (
                        <span className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-lg font-medium">
                          <Trophy className="w-2.5 h-2.5" />
                          {ride.earnedBadges!.length}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDuration(ride.duration)}
                      </span>
                      {isLatest && (
                        <span className="text-[10px] text-accent font-semibold">Latest</span>
                      )}
                      {settings.garageEnabled && bikes.length > 0 && (
                        <div onClick={(e) => e.stopPropagation()} className="ml-auto">
                          <Select
                            value={ride.bikeId ?? 'none'}
                            onValueChange={(v) => updateRideBike(ride.id, v === 'none' ? null : v)}
                          >
                            <SelectTrigger className="h-6 px-2 py-0 text-[10px] rounded-lg bg-secondary/60 border-border/40 gap-1 w-auto min-w-0">
                              <BikeIcon className="w-2.5 h-2.5 text-muted-foreground" />
                              <SelectValue placeholder="Vehicle" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No vehicle</SelectItem>
                              {bikes.map((b) => (
                                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="font-mono text-xl landscape:text-lg font-bold">{formatDistance(ride.distance, settings.distanceUnit)}</p>
                    <p className="text-[10px] text-muted-foreground">{getDistanceLabel(settings.distanceUnit)}</p>
                  </div>
                </div>
                {settings.speedFocusEnabled && (
                  <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
                    <span>Avg: {formatSpeed(ride.averageSpeed, settings.speedUnit)} {getSpeedLabel(settings.speedUnit)}</span>
                    <span>Max: {formatSpeed(ride.maxSpeed, settings.speedUnit)} {getSpeedLabel(settings.speedUnit)}</span>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
