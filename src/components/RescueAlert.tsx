import { MapPin, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RescueRequest } from '@/hooks/useRescue';
import { cn } from '@/lib/utils';

interface RescueAlertProps {
  requests: RescueRequest[];
  onAddWaypoint: (request: RescueRequest) => void;
  onDismiss: (requestId: string) => void;
}

export function RescueAlert({ requests, onAddWaypoint, onDismiss }: RescueAlertProps) {
  if (requests.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm space-y-2 animate-slide-up">
      {requests.map((request) => (
        <div
          key={request.id}
          className={cn(
            "bg-destructive/95 backdrop-blur-sm text-destructive-foreground rounded-xl p-3 shadow-lg",
            "border border-destructive-foreground/20"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive-foreground/20 flex items-center justify-center flex-shrink-0 animate-pulse">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{request.userName} needs rescue!</p>
              <p className="text-xs opacity-80 mt-0.5">Add them as a waypoint to navigate</p>
              
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={() => onAddWaypoint(request)}
                  className="h-8 bg-background text-foreground hover:bg-background/90"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Add Waypoint
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDismiss(request.id)}
                  className="h-8 text-destructive-foreground/70 hover:text-destructive-foreground hover:bg-destructive-foreground/10"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
