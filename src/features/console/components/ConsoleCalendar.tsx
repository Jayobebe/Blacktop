import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { da, de, enGB, es, fr, hi, id, it, ja, ko, nb, nl, pl, pt, sv, tr as trLocale, uk, zhCN, type Locale } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { tr, getLanguage } from '@/lib/i18n';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

const LOCALES: Record<string, Locale> = { da, de, en: enGB, es, fr, hi, id, it, ja, ko, nb, nl, pl, pt, sv, tr: trLocale, uk, zh: zhCN };

/**
 * The calendar behind the Console title's date square: the month with today in
 * the second accent (else the accent), any day picked to see what's on it.
 * Loaded only when opened (react-day-picker stays out of the Console until
 * then). Nothing is on it yet: rides, convoys and services will be.
 */
export default function ConsoleCalendar({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [day, setDay] = useState<Date>(() => new Date());
  const locale = LOCALES[getLanguage()] ?? enGB;
  const lang = document.documentElement.lang || undefined;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto safe-bottom">
        <SheetHeader className="text-left">
          <SheetTitle>{tr("Blacktop Calendar")}</SheetTitle>
          <SheetDescription>{new Date().toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</SheetDescription>
        </SheetHeader>
        <DayPicker
          mode="single"
          selected={day}
          onSelect={(d) => d && setDay(d)}
          weekStartsOn={1}
          locale={locale}
          showOutsideDays
          className="mt-2"
          classNames={{
            months: 'w-full',
            month: 'w-full space-y-3',
            caption: 'flex justify-center relative items-center h-11',
            caption_label: 'text-base font-semibold capitalize',
            nav: 'flex items-center',
            nav_button: 'glove-hit h-9 w-9 rounded-xl frost-accent inline-flex items-center justify-center',
            nav_button_previous: 'absolute left-0',
            nav_button_next: 'absolute right-0',
            table: 'w-full border-collapse',
            head_row: 'flex w-full',
            head_cell: 'flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground py-1',
            row: 'flex w-full mt-1',
            cell: 'flex-1 aspect-square p-0.5',
            day: 'w-full h-full rounded-xl text-sm font-medium font-mono hover:bg-accent/10 transition-colors',
            day_selected: 'ring-2 ring-accent',
            day_today: '!bg-[hsl(var(--lava,var(--accent)))] !text-[hsl(0_0%_6%)] font-black',
            day_outside: 'text-muted-foreground/40',
          }}
          components={{
            IconLeft: () => <ChevronLeft className="w-4 h-4" />,
            IconRight: () => <ChevronRight className="w-4 h-4" />,
          }}
        />
        <section className="mt-3 rounded-2xl frost border border-border/60 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {day.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className={cn('w-4 h-4 text-accent shrink-0')} />
            {tr("Nothing on this day yet.")}
          </p>
        </section>
      </SheetContent>
    </Sheet>
  );
}
