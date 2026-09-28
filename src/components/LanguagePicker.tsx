import { Check, Globe2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LANGUAGES, getLanguage, setLanguage, tr } from '@/lib/i18n';

/**
 * The app's language (opened from the BT logo in Settings). Each language is
 * listed in its own name with the English underneath; picking one reloads the
 * app in it.
 */
export function LanguagePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const current = getLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-accent" /> {tr('Language')}
          </DialogTitle>
          <DialogDescription>{tr('Blacktop reloads in the language you pick.')}</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 overflow-y-auto" role="radiogroup" aria-label={tr('Language')}>
          {LANGUAGES.map((l) => {
            const active = l.code === current;
            return (
              <button
                key={l.code}
                role="radio"
                aria-checked={active}
                lang={l.code}
                onClick={() => {
                  if (active) onOpenChange(false);
                  else setLanguage(l.code);
                }}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-accent/10', active && 'bg-accent/10')}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-foreground">{l.name}</span>
                  {l.name !== l.english && <span className="block text-xs text-muted-foreground">{l.english}</span>}
                </span>
                {active && <Check className="w-4 h-4 text-accent shrink-0" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
