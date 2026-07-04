import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRide, setSoloRoute, clearSoloRoute } from '@/features/ride';
import { openBlacktopMap } from '@/features/map';
import { DestinationSearch } from '@/features/waypoints';
import { useSettings } from '@/features/settings';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, MapPin, Map, Plus, X } from 'lucide-react';
import { ConvoyDestination } from '@/types/convoy';

interface UserLocation {
  lat: number;
  lng: number;
}

export default function SoloLobby() {
  const navigate = useNavigate();
  const { startRide } = useActiveRide();
  const { settings } = useSettings();
  const [destination, setDestination] = useState<ConvoyDestination | null>(null);
  const [soloStops, setSoloStops] = useState<ConvoyDestination[]>([]);
  const [showAddStop, setShowAddStop] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);

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
    setSoloRoute({
      destination: { lat: dest.lat, lng: dest.lng, name: dest.name, address: dest.address },
      stops: soloStops.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name, address: s.address })),
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


  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6 animate-fade-in">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Solo Ride</h1>
          <p className="text-xs text-muted-foreground">Set a destination and hit the road</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
        {/* Destination Search */}
        <div className="animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-medium">Destination</h2>
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Add Stop</p>
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
            Add another stop
          </button>
        )}

        <div className="flex-1" />

        {/* Action Buttons */}
        <div className="animate-slide-up delay-200 pb-4 space-y-3">
          {destination && (
            <Button
              onClick={handleNavigate}
              size="xl"
              className="w-full h-16 text-lg font-semibold bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl shadow-glow"
            >
              <Map className="w-6 h-6 mr-3" />
              Navigate
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
            {destination ? 'Start without map' : 'Start Ride'}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {destination
              ? 'Navigate opens the map with your route · Start without map tracks only'
              : 'Destination is optional — you can ride freely'}
          </p>
        </div>
      </div>
    </div>
  );
}
