import { forwardRef, type SVGProps } from 'react';

/**
 * Lucide-style glyphs for vehicles lucide doesn't ship. Same 24×24 grid,
 * stroke 2, currentColor — drop-in alongside lucide icons.
 */
type IconProps = SVGProps<SVGSVGElement>;

function makeIcon(name: string, children: React.ReactNode) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function VehicleIcon(props, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {children}
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

export const MotorcycleIcon = makeIcon(
  'MotorcycleIcon',
  <>
    <circle cx="5" cy="16" r="3" />
    <circle cx="19" cy="16" r="3" />
    <path d="M5 16 9 10h5l5 6" />
    <path d="M9 10 11 16h3l2.5-6" />
    <path d="M14 10 16 6h2" />
    <path d="M7 10h3" />
  </>
);

export const EBikeIcon = makeIcon(
  'EBikeIcon',
  <>
    <circle cx="5.5" cy="17" r="3.5" />
    <circle cx="18.5" cy="17" r="3.5" />
    <path d="M5.5 17 9 10h7l2.5 7" />
    <path d="M9 10 12 17l4-7" />
    <path d="M15 6h2l-1 4" />
    <path d="m11 3-1.5 3h3L11 9" />
  </>
);

export const ScooterIcon = makeIcon(
  'ScooterIcon',
  <>
    <circle cx="5" cy="18" r="2.5" />
    <circle cx="19" cy="18" r="2.5" />
    <path d="M5 18h11l3-13" />
    <path d="M16 5h4" />
  </>
);
