import { cn } from '@/lib/utils';
import { ACCENT_COLORS, AccentColor } from '@/hooks/useSettings';
import { Check } from 'lucide-react';

interface AccentColorPickerProps {
  selected: AccentColor;
  onSelect: (color: AccentColor) => void;
}

export function AccentColorPicker({ selected, onSelect }: AccentColorPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {ACCENT_COLORS.map((color) => (
        <button
          key={color.id}
          onClick={() => onSelect(color.id)}
          className={cn(
            "relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200",
            "hover:bg-secondary/50 active:scale-95",
            selected === color.id && "bg-secondary"
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center",
              selected === color.id && "ring-2 ring-offset-2 ring-offset-card"
            )}
            style={{ 
              backgroundColor: `hsl(${color.hsl})`,
              boxShadow: selected === color.id ? `0 0 20px hsl(${color.hsl} / 0.5)` : undefined,
              outlineColor: `hsl(${color.hsl})`
            }}
          >
            {selected === color.id && (
              <Check className="w-5 h-5 text-white drop-shadow-md" />
            )}
          </div>
          <span className={cn(
            "text-xs font-medium transition-colors",
            selected === color.id ? "text-foreground" : "text-muted-foreground"
          )}>
            {color.label}
          </span>
        </button>
      ))}
    </div>
  );
}