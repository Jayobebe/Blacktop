import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRide, setSoloRoute, clearSoloRoute } from '@/features/ride';
import { openBlacktopMap, RouteOptions, RouteMode } from '@/features/map';
import { DestinationSearch } from '@/features/waypoints';
import { useSettings } from '@/features/settings';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, MapPin, Map, Plus, X, Lock, Unlock } from 'lucide-react';
import { ConvoyDestination } from '@/types/convoy';
import { toast } from 'sonner';
import { nudgePush } from '@/features/notifications';
import { useConvoyState } from '@/features/convoy';
import { useCrew } from '@/features/crew/useCrew';
import { useExperience } from '@/features/experience';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { useWakeLock } from '@/hooks/useWakeLock';
import { tr } from '@/lib/i18n';

interface UserLocation {
  lat: number;
  lng: number;
}

export default function SoloLobby() {
  const navigate = useNavigate();
  const { startRide } = useActiveRide();
  const { settings } = useSettings();
  const { terms, isCarOnly, showGroup } = useExperience();
  const { convoy, createConvoy, leaveConvoy } = useConvoyState();
  const crew = useCrew();
  const [busyLock, setBusyLock] = useState(false);
  const [destination, setDestination] = useState<ConvoyDestination | null>(null);
  const [soloStops, setSoloStops] = useState<ConvoyDestination[]>([]);
  const [showAddStop, setShowAddStop] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>('direct');
  const [twistyVia, setTwistyVia] = useState<{ lat: number; lng: number } | null>(null);

  // Screen stays on while planning (including on the map) and gearing up.
  const wakeLock = useWakeLock();
  useEffect(() => {
    void wakeLock.request();
    return () => {
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          try {
            const { data } = await supabase.functions.invoke('place-search', {
              body: { kind: 'reverse', lat: loc.lat, lon: loc.lng, zoom: 3 },
            });
            if (data?.address?.country_code) {
              setCountryCode(data.address.country_code.toUpperCase());
            }
          } catch {
            // Ignore errors
          }
        },
        (error) => {
          console.warn('[SoloLobby] Could not get location:', error.message);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  const handleSetDestination = (dest: ConvoyDestination) => {
    setDestination(dest);
  };

  const handleClearDestination = () => {
    setDestination(null);
    setSoloStops([]);
    setRouteMode('direct');
    setTwistyVia(null);
    setShowAddStop(false);
    clearSoloRoute();
  };

  // Persist the planned destination + stops so they survive into the active
  // ride: the map button in ActiveRide will replay them onto BlacktopMap.
  const persistSoloRoute = (dest: ConvoyDestination | null) => {
    if (!dest) {
      clearSoloRoute();
      return;
    }
    // A twisty pick rides through an extra via point before the rider's stops.
    const via = routeMode === 'twisty' && twistyVia
      ? [{ lat: twistyVia.lat, lng: twistyVia.lng, name: tr("Twisty leg"), address: '' }]
      : [];
    setSoloRoute({
      destination: { lat: dest.lat, lng: dest.lng, name: dest.name, address: dest.address },
      stops: [...via, ...soloStops.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name, address: s.address }))],
    });
  };

  // Start the ride without opening the map (free-ride, no destination required).
  const handleStartRide = () => {
    persistSoloRoute(destination);
    const success = startRide(false);
    if (success) {
      navigate('/ride');
    }
  };

  // Open the Blacktop map overlay, start the ride, then navigate to the ride
  // screen — the map stays open on top of the ride UI so the rider has the
  // route + live speed immediately visible.
  const handleNavigate = () => {
    if (!destination) return;
    persistSoloRoute(destination);
    const success = startRide(false);
    if (!success) return;

    // Route to /ride *before* opening the overlay so the active-ride screen
    // is fully mounted underneath. Defer openBlacktopMap to a microtask so
    // React commits the navigate first — otherwise on some closes the rider
    // can fall back to /solo-lobby instead of /ride.
    navigate('/ride');
    queueMicrotask(() => {
      openBlacktopMap({
        lat: destination.lat,
        lng: destination.lng,
        name: destination.name,
        address: destination.address,
      });
    });
  };

  // Unlocking a solo lobby publishes it to the crew list. The moment another
  // rider joins, it becomes a group lobby and we hand over to /lobby.
  const toggleUnlocked = async () => {
    if (busyLock) return;
    setBusyLock(true);
    try {
      if (convoy.isActive && convoy.isLeader) {
        await supabase.from('convoys').update({ is_listed: false } as any).eq('id', convoy.id!);
        await leaveConvoy();
        toast.success(tr("Solo lobby locked"));
      } else {
        const created = await createConvoy();
        if (!created?.id) return;
        await supabase
          .from('convoys')
          .update({ is_listed: true, crew_code: crew.code } as any)
          .eq('id', created.id);
        nudgePush(); // the crew hears about the open convoy
        toast.success(tr("Listed in crew {0}", [crew.code]), {
          description: tr("Riders who join turn this into a group lobby."),
        });
      }
    } finally {
      setBusyLock(false);
    }
  };

  const isUnlocked = convoy.isActive && convoy.isLeader;

  // Somebody joined the open solo lobby → it's a group ride now.
  useEffect(() => {
    if (isUnlocked && convoy.members.length > 1) {
      toast.success(tr("Rider joined — group lobby"));
      navigate('/lobby');
    }
  }, [isUnlocked, convoy.members.length, navigate]);

  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6">
      {/* Header */}
      <PageHeader
        title={showGroup ? tr("Solo {0}", [terms.Ride]) : tr("New {0}", [terms.Ride])}
        subtitle={isUnlocked ? tr("Open to crew {0}", [crew.code]) : tr("Set a destination and hit the road")}
        backTo="/"
        right={
          <HeaderButton
            onClick={toggleUnlocked}
            disabled={busyLock}
            active={isUnlocked}
            title={isUnlocked ? tr("Locked to crew list — tap to lock") : tr("Tap to list in Crew Convoys")}
            aria-label={isUnlocked ? tr("Lock lobby") : tr("Unlock lobby to crew")}
          >
            {isUnlocked ? <Unlock className="w-[18px] h-[18px]" /> : <Lock className="w-[18px] h-[18px]" />}
          </HeaderButton>
        }
      />


      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
        {/* Destination Search */}
        <div className="animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-medium">{tr("Destination")}</h2>
          </div>
          <DestinationSearch
            destination={destination}
            onSetDestination={handleSetDestination}
            onClearDestination={handleClearDestination}
            onAddStop={destination ? () => setShowAddStop(true) : undefined}
            isLeader={true}
            userLocation={userLocation}
            countryCode={countryCode}
            distanceUnit={settings.distanceUnit}
          />
        </div>

        {/* Additional stops */}
        {soloStops.length > 0 && (
          <div className="space-y-2 animate-fade-in">
            {soloStops.map((stop, i) => (
              <div key={i} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{stop.name}</p>
                  {stop.address && <p className="text-xs text-muted-foreground truncate">{stop.address}</p>}
                </div>
                <button
                  onClick={() => setSoloStops(stops => stops.filter((_, idx) => idx !== i))}
                  className="p-1 hover:bg-muted rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add stop search */}
        {showAddStop && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{tr("Add Stop")}</p>
              <button
                onClick={() => setShowAddStop(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <DestinationSearch
              destination={null}
              onSetDestination={(dest) => {
                setSoloStops(stops => [...stops, dest]);
                setShowAddStop(false);
              }}
              onClearDestination={() => {}}
              isLeader={true}
              userLocation={userLocation}
              countryCode={countryCode}
              distanceUnit={settings.distanceUnit}
            />
          </div>
        )}

        {/* Add another stop button when not yet showing the search */}
        {destination && !showAddStop && (
          <button
            onClick={() => setShowAddStop(true)}
            className="flex items-center gap-2 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {tr("Add another stop")}
          </button>
        )}

        <div className="flex-1" />

        {/* Action Buttons */}
        <div className="animate-slide-up delay-200 pb-4 space-y-3">
          {destination && (
            <RouteOptions
              start={userLocation}
              stops={soloStops.map((s) => ({ lat: s.lat, lng: s.lng }))}
              destination={{ lat: destination.lat, lng: destination.lng }}
              mode={routeMode}
              onModeChange={setRouteMode}
              onTwistyVia={setTwistyVia}
            />
          )}
          {destination && (
            <Button
              onClick={handleNavigate}
              size="xl"
              className="w-full h-16 text-lg font-semibold bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl shadow-glow"
            >
              <Map className="w-6 h-6 mr-3" />
              {tr("Navigate")}
            </Button>
          )}
          <Button
            onClick={handleStartRide}
            size="xl"
            variant={destination ? 'outline' : 'default'}
            className={destination
              ? 'w-full h-14 text-base font-semibold rounded-2xl border-border'
              : 'w-full h-16 text-lg font-semibold bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl shadow-glow'
            }
          >
            <Play className="w-5 h-5 mr-3" />
            {destination ? tr("Start without map") : tr("Start {0}", [terms.Ride])}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {destination
              ? tr("Navigate opens the map with your route · Start without map tracks only")
              : tr("Destination is optional. You can just {0}.", [isCarOnly ? 'drive' : 'ride'])}
          </p>
        </div>
      </div>
    </div>
  );
}
