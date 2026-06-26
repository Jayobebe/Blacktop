import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRide } from '@/features/ride';
import { openBlacktopMap } from '@/features/map';
import { DestinationSearch } from '@/features/waypoints';
import { useSettings } from '@/features/settings';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, MapPin, Map } from 'lucide-react';
import { ConvoyDestination } from '@/types/convoy';
import { openBlacktopMap } from '@/features/map';

interface UserLocation {
  lat: number;
  lng: number;
}

export default function SoloLobby() {
  const navigate = useNavigate();
  const { startRide } = useActiveRide();
  const { settings } = useSettings();
  const [destination, setDestination] = useState<ConvoyDestination | null>(null);
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
  };

  // Start the ride without opening the map (free-ride, no destination required).
  const handleStartRide = () => {
    const success = startRide(false);
    if (success) {
      navigate('/ride');
    }
  };

  // Open the Blacktop map overlay, start the ride, then navigate to the ride
  // screen — the map stays open on top of the ride UI so the rider has the
  // route + live speed immediately visible.
  const handleNavigate = () => {
    if (destination) {
      openBlacktopMap({ lat: destination.lat, lng: destination.lng, name: destination.name });
    }
    const success = startRide(false);
    if (!success) return;

    // Route to /ride *before* opening the overlay so the active-ride screen
    // is fully mounted underneath. Defer openBlacktopMap to a microtask so
    // React commits the navigate first — otherwise on some closes the rider
    // can fall back to /solo-lobby instead of /ride.
    navigate('/ride');
    queueMicrotask(() => {
      if (destination) {
        openBlacktopMap({
          lat: destination.lat,
          lng: destination.lng,
          name: destination.name,
          address: destination.address,
        });
      } else {
        openBlacktopMap();
      }
    });
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 safe-top safe-bottom md:p-5 lg:p-6">
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
      <div className="flex-1 flex flex-col gap-6 min-h-0">
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
            isLeader={true}
            userLocation={userLocation}
            countryCode={countryCode}
            distanceUnit={settings.distanceUnit}
          />
        </div>

        {/* Spacer */}
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
