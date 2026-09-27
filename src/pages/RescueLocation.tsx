import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { setRescueTarget } from '@/features/rescue';
import { openBlacktopMap } from '@/features/map';

function ago(ms: number) {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Opened from a rescue notification: who needs help, where, and one tap to
 * route to them on the Blacktop map or in Google Maps.
 */
export default function RescueLocation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const name = (params.get('name') || 'A rider').slice(0, 30);
  const at = Number(params.get('at')) || null;
  const known = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const coords = useMemo(() => (known ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null), [known, lat, lng]);

  const showOnMap = () => {
    setRescueTarget({ userId: `push-${name}`, userName: name, lat, lng });
    navigate('/', { replace: true });
    openBlacktopMap();
  };

  return (
    <div className="min-h-dvh flex flex-col p-4 safe-top safe-bottom gap-4">
      <PageHeader title="Rescue call" backTo="/" />
      <div className="rounded-2xl border-2 border-warning/60 bg-warning/10 p-4 flex items-start gap-3">
        <AlertTriangle className="w-7 h-7 text-warning shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-lg font-bold">{name} needs rescue</p>
          {at && <p className="text-xs text-muted-foreground">Called {ago(at)}</p>}
          <p className="text-sm text-muted-foreground mt-2">
            {coords ? (
              <>
                Last known position <span className="font-mono text-foreground">{coords}</span>
              </>
            ) : (
              "Their phone couldn't get a location. Try calling them."
            )}
          </p>
        </div>
      </div>

      {known && (
        <div className="grid gap-2">
          <Button className="h-12 gap-2" onClick={showOnMap}>
            <MapIcon className="w-5 h-5" /> Route to them on the Blacktop map
          </Button>
          <Button asChild variant="outline" className="h-12 gap-2">
            <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-5 h-5" /> Open in Google Maps
            </a>
          </Button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        If they may be hurt and you can't reach them, call the emergency services and give them this location.
      </p>
    </div>
  );
}
