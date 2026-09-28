import { cn } from '@/lib/utils';
import { ACCENT_COLORS, AccentColor } from '@/features/settings';
import { Check } from 'lucide-react';
import { tr } from '@/lib/i18n';

interface AccentColorPickerProps {
  selected: AccentColor;
  secondary: AccentColor | null;
  onChange: (main: AccentColor, secondary: AccentColor | null) => void;
}

/**
 * Tap one colour for the main accent; tap another to add it as the secondary
 * (tints the background lava). Tap the secondary again to remove it; tapping
 * the main colour promotes the secondary to main.
 */
export function AccentColorPicker({ selected, secondary, onChange }: AccentColorPickerProps) {
  const pick = (id: AccentColor) => {
    if (id === secondary) return onChange(selected, null);
    // Tapping the main colour hands the main role to the secondary (if any).
    if (id === selected) return secondary ? onChange(secondary, null) : undefined;
    onChange(selected, id);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {tr("Tap a second colour to tint the background glow. Tap it again to remove it.")}
      </p>
      <div className="grid grid-cols-4 gap-3">
        {ACCENT_COLORS.map((color) => {
          const isMain = selected === color.id;
          const isSecondary = secondary === color.id;
          return (
            <button
              key={color.id}
              onClick={() => pick(color.id)}
              className={cn(
                "relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200",
                "hover:bg-secondary/50 active:scale-95",
                (isMain || isSecondary) && "bg-secondary"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center",
                  isMain && "ring-2 ring-offset-2 ring-offset-card",
                  isSecondary && "ring-2 ring-dashed ring-offset-2 ring-offset-card"
                )}
                style={{
                  backgroundColor: `hsl(${color.hsl})`,
                  boxShadow: isMain || isSecondary ? `0 0 20px hsl(${color.hsl} / 0.5)` : undefined,
                  ['--tw-ring-color' as string]: `hsl(${color.hsl})`,
                }}
              >
                {isMain && <Check className="w-5 h-5 text-background drop-shadow-md" />}
                {isSecondary && <span className="text-sm font-bold text-background">2</span>}
              </div>
              <span className={cn(
                "text-xs font-medium transition-colors",
                isMain || isSecondary ? "text-foreground" : "text-muted-foreground"
              )}>
                {isSecondary ? tr("{0} · glow", [color.label]) : color.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
