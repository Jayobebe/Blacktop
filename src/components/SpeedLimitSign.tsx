import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { limitFigure, type SpeedLimit } from '@/lib/speedLimit';

/** The US and Canada post a white rectangle; everywhere else a red ring. From the phone's region. */
function rectangleSigns(): boolean {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region === 'US' || region === 'CA';
  } catch {
    return false;
  }
}
const RECT = rectangleSigns();

/**
 * The road's speed limit drawn as its sign (lib/speedLimit), in the rider's
 * unit: the sign's own figure when the units match. `size` is the sign's
 * height in px. Hidden from screen readers' flow as a picture with a label.
 */
export function SpeedLimitSign({ limit, unit, size = 44, className }: { limit: SpeedLimit; unit: string; size?: number; className?: string }) {
  const figure = limitFigure(limit, unit);
  const label = tr("Speed limit {0}", [figure]);
  const digits = String(figure).length;
  if (RECT) {
    return (
      <div
        role="img"
        aria-label={label}
        data-tip="speed-limit"
        className={cn('bg-white text-black rounded-md border-2 border-black flex flex-col items-center justify-center leading-none font-bold shadow-lg select-none', className)}
        style={{ height: size, width: size * 0.82 }}
      >
        <span style={{ fontSize: size * 0.16 }} className="tracking-tight">{tr("LIMIT")}</span>
        <span style={{ fontSize: size * (digits > 2 ? 0.4 : 0.5) }} className="font-mono font-black">{figure}</span>
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={label}
      data-tip="speed-limit"
      className={cn('rounded-full bg-white text-black flex items-center justify-center font-mono font-black leading-none shadow-lg select-none', className)}
      style={{ width: size, height: size, border: `${Math.max(3, Math.round(size * 0.12))}px solid #dc2626`, fontSize: size * (digits > 2 ? 0.34 : 0.42) }}
    >
      {figure}
    </div>
  );
}
