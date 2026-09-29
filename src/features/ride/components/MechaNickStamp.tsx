import { memo, useId } from 'react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

/**
 * Mecha-Nick's rubber stamp for the paper receipt: a tilted double-ring roundel
 * ("MECHA-NICK" over the top, "CERTIFIED" underneath, a wrench-and-cog in the
 * middle) with his scrawled sign-off and the date across it. Drawn in the
 * surrounding text colour (the receipt's ink) with rough, uneven edges.
 */
export const MechaNickStamp = memo(function MechaNickStamp({ date, className }: { date?: string | null; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const top = `nick-top-${uid}`;
  const bottom = `nick-bottom-${uid}`;
  const rough = `nick-rough-${uid}`;
  const when = date ? new Date(date) : new Date();
  const dateText = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase();

  return (
    <div className={cn('relative w-28 aspect-square select-none', className)} aria-label={tr("Certified by Mecha-Nick")}>
      <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible" style={{ transform: 'rotate(-12deg)' }}>
        <defs>
          {/* Uneven ink: a little displacement roughens every edge like a real stamp */}
          <filter id={rough} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" />
          </filter>
          <path id={top} d="M 22 60 A 38 38 0 0 1 98 60" />
          <path id={bottom} d="M 18 60 A 42 42 0 0 0 102 60" />
        </defs>
        <g filter={`url(#${rough})`} className="fill-current stroke-current" opacity="0.82">
          <circle cx="60" cy="60" r="54" fill="none" strokeWidth="3" />
          <circle cx="60" cy="60" r="48" fill="none" strokeWidth="1.2" />
          <circle cx="60" cy="60" r="27" fill="none" strokeWidth="1.2" />
          <text fontSize="11" fontWeight="800" letterSpacing="2.2" stroke="none">
            <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">{tr("MECHA-NICK")}</textPath>
          </text>
          <text fontSize="10" fontWeight="800" letterSpacing="2.5" stroke="none">
            <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle">{tr("CERTIFIED")}</textPath>
          </text>
          {/* Stars either side, between the words */}
          <text x="14" y="64" fontSize="9" stroke="none" textAnchor="middle">★</text>
          <text x="106" y="64" fontSize="9" stroke="none" textAnchor="middle">★</text>
          {/* Cog */}
          <g transform="translate(60 60)" stroke="none">
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x="-2.6" y="-19" width="5.2" height="6" rx="1" transform={`rotate(${i * 45})`} />
            ))}
            <circle r="14.5" />
            <circle r="7.5" className="fill-[var(--paper,white)]" />
          </g>
          {/* Wrench across the cog */}
          <g transform="translate(60 60) rotate(-40)" stroke="none">
            <rect x="-2.4" y="-21" width="4.8" height="30" rx="2" />
            <path d="M -7 -24 a 8 8 0 1 0 14 0 l -3.2 4.2 h -7.6 z" />
          </g>
        </g>
        {/* Signature and date, scrawled across the stamp */}
        <text
          x="62"
          y="84"
          textAnchor="middle"
          className="fill-current"
          fontSize="19"
          fontStyle="italic"
          fontFamily="'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive"
          style={{ transform: 'rotate(8deg)', transformOrigin: '62px 84px' }}
          opacity="0.9"
        >
          M. Nick
        </text>
        {dateText && (
          <text x="60" y="126" textAnchor="middle" className="fill-current font-mono" fontSize="8" letterSpacing="1" opacity="0.8">
            {dateText}
          </text>
        )}
      </svg>
    </div>
  );
});
