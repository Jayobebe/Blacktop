import { useState, useEffect } from 'react';
import { Navigation, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Destination } from '@/types/convoy';
import { cn } from '@/lib/utils';

interface DestinationAlertProps {
  destination: Destination;
  onOpenNavigation: (app: 'google' | 'apple' | 'waze') => void;
  onDismiss: () => void;
}

export function DestinationAlert({ destination, onOpenNavigation, onDismiss }: DestinationAlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Auto-dismiss after 30 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 30000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 p-4 animate-slide-up">
      <div className="max-w-md mx-auto bg-warning/95 backdrop-blur-lg rounded-2xl p-4 shadow-2xl border border-warning-foreground/10">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-warning-foreground/10 shrink-0">
            <Navigation className="w-6 h-6 text-warning-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-bold text-warning-foreground">
                New Destination Set!
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setIsVisible(false); onDismiss(); }}
                className="h-6 w-6 text-warning-foreground/70 hover:text-warning-foreground hover:bg-warning-foreground/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <p className="font-semibold text-warning-foreground">{destination.name}</p>
            <p className="text-sm text-warning-foreground/80 truncate">{destination.address}</p>
            <p className="text-xs text-warning-foreground/60 mt-1">
              Set by {destination.setBy}
            </p>

            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => onOpenNavigation('google')}
                className="flex-1 bg-warning-foreground/20 hover:bg-warning-foreground/30 text-warning-foreground text-xs"
              >
                Google Maps
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
              <Button
                size="sm"
                onClick={() => onOpenNavigation('waze')}
                className="flex-1 bg-warning-foreground/20 hover:bg-warning-foreground/30 text-warning-foreground text-xs"
              >
                Waze
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
