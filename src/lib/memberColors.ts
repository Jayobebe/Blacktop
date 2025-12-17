import { AccentColor, ACCENT_COLORS } from '@/hooks/useSettings';

// Map accent color to tailwind-compatible inline styles
export function getMemberColorStyles(accentColor: string = 'orange') {
  const color = ACCENT_COLORS.find(c => c.id === accentColor) || ACCENT_COLORS[0];
  const hsl = color.hsl;
  
  return {
    bg: `hsl(${hsl} / 0.2)`,
    text: `hsl(${hsl})`,
    border: `hsl(${hsl} / 0.3)`,
    ring: `hsl(${hsl} / 0.5)`,
    glow: `0 0 8px 2px hsl(${hsl} / 0.6)`,
  };
}

// Fallback colors for members without accent color (backwards compatibility)
export const FALLBACK_MEMBER_COLORS = [
  { id: 'emerald', hsl: '142 71% 45%' },
  { id: 'blue', hsl: '217 91% 60%' },
  { id: 'purple', hsl: '262 83% 58%' },
  { id: 'orange', hsl: '38 95% 55%' },
  { id: 'pink', hsl: '330 81% 60%' },
  { id: 'cyan', hsl: '186 94% 50%' },
];

export function getFallbackColorStyles(index: number) {
  const color = FALLBACK_MEMBER_COLORS[index % FALLBACK_MEMBER_COLORS.length];
  const hsl = color.hsl;
  
  return {
    bg: `hsl(${hsl} / 0.2)`,
    text: `hsl(${hsl})`,
    border: `hsl(${hsl} / 0.3)`,
    ring: `hsl(${hsl} / 0.5)`,
    glow: `0 0 8px 2px hsl(${hsl} / 0.6)`,
  };
}