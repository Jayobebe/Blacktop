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
      <div className="grid grid-cols-5 gap-1.5">
        {ACCENT_COLORS.map((color) => {
          const isMain = selected === color.id;
          const isSecondary = secondary === color.id;
          return (
            <button
              key={color.id}
              onClick={() => pick(color.id)}
              className={cn(
                "relative flex flex-col items-center gap-2 px-1 py-2.5 rounded-xl transition-all duration-200 min-w-0",
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
                  // Eclipse: a black disc with a white halo, as it looks in the app.
                  backgroundColor: color.eclipse ? 'hsl(0 0% 3%)' : `hsl(${color.hsl})`,
                  boxShadow: color.eclipse
                    ? `0 0 0 1.5px hsl(0 0% 96%), 0 0 ${isMain || isSecondary ? 20 : 9}px hsl(0 0% 100% / 0.55)`
                    : isMain || isSecondary ? `0 0 20px hsl(${color.hsl} / 0.5)` : undefined,
                  ['--tw-ring-color' as string]: `hsl(${color.hsl})`,
                }}
              >
                {isMain && <Check className={cn("w-5 h-5 drop-shadow-md", color.eclipse ? "text-white" : "text-background")} />}
                {isSecondary && <span className={cn("text-sm font-bold", color.eclipse ? "text-white" : "text-background")}>2</span>}
              </div>
              <span className={cn(
                "text-[11px] leading-tight text-center font-medium transition-colors max-w-full break-words",
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
