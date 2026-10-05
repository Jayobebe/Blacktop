import { MapPin, Navigation, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RescueRequest } from '@/features/rescue';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { W3WAddress } from '@/components/W3WAddress';

interface RescueAlertProps {
  requests: RescueRequest[];
  /** Leader adds the rider as a waypoint; everyone else says they're on the way. */
  isLeader: boolean;
  onAddWaypoint: (request: RescueRequest) => void;
  /**
   * "I'm on my way": tells the rider in distress (and the convoy) this member is
   * coming. Every member can answer, not just the leader.
   */
  onRespond: (request: RescueRequest) => void;
  /** Closes the card on this phone only, without answering. */
  onDismiss: (requestId: string) => void;
}

export function RescueAlert({ requests, isLeader, onAddWaypoint, onRespond, onDismiss }: RescueAlertProps) {
  if (requests.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 safe-frame flex items-center justify-center p-3 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm max-h-full overflow-y-auto space-y-3 animate-scale-in">
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
                <p className="font-bold text-lg">{request.userName}{" "}{tr("needs rescue!")}</p>
                <p className="text-sm opacity-80 mt-1">
                  {isLeader
                    ? tr("Add them as a waypoint to route the convoy to them")
                    : tr("Their location is marked on the map. Let them know you’re coming.")}
                </p>
              </div>
              {/* Their what3words square, to pass on to emergency services (when Blacktop has what3words). */}
              <W3WAddress lat={request.lat} lng={request.lng} showNearest className="text-base" />
              
              <div className="flex gap-3 mt-2 w-full">
                {isLeader ? (
                  <Button
                    size="lg"
                    onClick={() => onAddWaypoint(request)}
                    className="flex-1 h-12 bg-background text-foreground hover:bg-background/90 font-semibold"
                  >
                    <UserPlus className="w-5 h-5 mr-2" />
                    {tr("Add Waypoint")}
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={() => onRespond(request)}
                    className="flex-1 h-12 bg-background text-foreground hover:bg-background/90 font-semibold"
                  >
                    <Navigation className="w-5 h-5 mr-2" />
                    {tr("I'm on my way")}
                  </Button>
                )}
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
