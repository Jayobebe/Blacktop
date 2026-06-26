import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRide } from '@/features/ride';
import { DestinationSearch } from '@/features/waypoints';
import { useSettings } from '@/features/settings';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, MapPin } from 'lucide-react';
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
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);

  // Fetch user location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          // Get country code for better search results
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

  const handleStartRide = () => {
    // Start a solo ride (not convoy mode)
    const success = startRide(false);
    if (success) {
      navigate('/ride');
      // Surface the map overlay on top of /ride so the rider immediately
      // sees their route + live speed. Closing the overlay drops them back
      // onto the active-ride screen underneath.
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
    }
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

        {/* Start Ride Button */}
        <div className="animate-slide-up delay-200 pb-4">
          <Button
            onClick={handleStartRide}
            size="xl"
            className="w-full h-16 text-lg font-semibold bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl shadow-glow"
          >
            <Play className="w-6 h-6 mr-3" />
            Start Ride
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Destination is optional — you can ride freely
          </p>
        </div>
      </div>
    </div>
  );
}
