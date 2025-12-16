import { useState } from 'react';
import { MapPin, Navigation, X, ExternalLink, AlertCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Destination } from '@/types/convoy';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DestinationPanelProps {
  destination?: Destination;
  isLeader: boolean;
  onSetDestination: (dest: Omit<Destination, 'id' | 'setBy' | 'setAt'>) => void;
  onClearDestination: () => void;
  onOpenNavigation: (app: 'google' | 'apple' | 'waze') => void;
}

// Popular preset destinations for demo
const presetDestinations = [
  { name: 'Gas Station', address: 'Shell Gas - Highway 101', lat: 37.7749, lng: -122.4194 },
  { name: 'Rest Stop', address: 'Rest Area Mile 45', lat: 37.8044, lng: -122.2712 },
  { name: 'Restaurant', address: 'Diner on Route 66', lat: 37.6879, lng: -122.4702 },
];

export function DestinationPanel({
  destination,
  isLeader,
  onSetDestination,
  onClearDestination,
  onOpenNavigation,
}: DestinationPanelProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSetDestination = (preset: typeof presetDestinations[0]) => {
    onSetDestination(preset);
    setShowSearch(false);
    toast.success('Destination set!', {
      description: `${preset.name} - All convoy members notified`,
    });
  };

  return (
    <div className="glass rounded-2xl p-4 animate-slide-up delay-400">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-muted-foreground tracking-wider uppercase">
          Destination
        </h2>
        {isLeader && !destination && (
          <Button
            variant="glass"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className="text-xs"
          >
            <MapPin className="w-3.5 h-3.5 mr-1" />
            Set Marker
          </Button>
        )}
      </div>

      {/* Destination Set */}
      {destination ? (
        <div className="space-y-4">
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-warning/20">
                <Navigation className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{destination.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{destination.address}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Set by {destination.setBy}
                </p>
              </div>
              {isLeader && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClearDestination}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <NavButton
              label="Google"
              onClick={() => onOpenNavigation('google')}
              color="bg-[#4285F4]"
            />
            <NavButton
              label="Apple"
              onClick={() => onOpenNavigation('apple')}
              color="bg-[#333]"
            />
            <NavButton
              label="Waze"
              onClick={() => onOpenNavigation('waze')}
              color="bg-[#33CCFF]"
            />
          </div>
        </div>
      ) : showSearch && isLeader ? (
        /* Search/Set Destination UI */
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Quick select:</p>
            {presetDestinations.map((preset, i) => (
              <button
                key={i}
                onClick={() => handleSetDestination(preset)}
                className="w-full flex items-center gap-3 p-3 bg-secondary/30 hover:bg-secondary/50 rounded-lg transition-colors text-left"
              >
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm">{preset.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{preset.address}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* No Destination Set */
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-4 rounded-full bg-secondary/50 mb-3">
            <MapPin className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {isLeader 
              ? "Set a destination for your convoy"
              : "Waiting for leader to set destination"
            }
          </p>
          {!isLeader && (
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground/70">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>You'll be notified when a marker is set</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NavButton({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 text-xs font-medium",
        color,
        "text-white hover:opacity-90"
      )}
    >
      {label}
      <ExternalLink className="w-3 h-3" />
    </Button>
  );
}
