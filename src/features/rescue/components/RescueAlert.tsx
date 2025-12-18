import { MapPin, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RescueRequest } from '@/features/rescue';
import { cn } from '@/lib/utils';

interface RescueAlertProps {
  requests: RescueRequest[];
  onAddWaypoint: (request: RescueRequest) => void;
  onDismiss: (requestId: string) => void;
}

export function RescueAlert({ requests, onAddWaypoint, onDismiss }: RescueAlertProps) {
  if (requests.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-[90vw] max-w-sm space-y-3 animate-scale-in">
        {requests.map((request) => (
          <div
            key={request.id}
            className={cn(
              "bg-destructive text-destructive-foreground rounded-2xl p-4 shadow-2xl",
              "border-2 border-destructive-foreground/30"
            )}
          >
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-destructive-foreground/20 flex items-center justify-center animate-pulse">
                <MapPin className="w-7 h-7" />
              </div>
              <div>
                <p className="font-bold text-lg">{request.userName} needs rescue!</p>
                <p className="text-sm opacity-80 mt-1">Add them as a waypoint to navigate to their location</p>
              </div>
              
              <div className="flex gap-3 mt-2 w-full">
                <Button
                  size="lg"
                  onClick={() => onAddWaypoint(request)}
                  className="flex-1 h-12 bg-background text-foreground hover:bg-background/90 font-semibold"
                >
                  <UserPlus className="w-5 h-5 mr-2" />
                  Add Waypoint
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => onDismiss(request.id)}
                  className="h-12 px-4 text-destructive-foreground/70 hover:text-destructive-foreground hover:bg-destructive-foreground/10"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
