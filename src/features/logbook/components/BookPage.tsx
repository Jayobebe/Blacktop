import { cn } from '@/lib/utils';

/** One page of the logbook: lined paper, the page number in the outer corner. */
export function Page({ children, n, side }: { children: React.ReactNode; n: number; side: 'l' | 'r' }) {
  return (
    <div
      className={cn(
        'relative h-full flex flex-col px-2.5 pt-3 pb-5 text-[#2b2118] bg-[#f6eed9] overflow-hidden',
        '[background-image:repeating-linear-gradient(0deg,transparent_0,transparent_15px,rgba(80,60,30,0.10)_15px,rgba(80,60,30,0.10)_16px)]',
        side === 'l' ? 'rounded-l-md shadow-[inset_-10px_0_14px_-10px_rgba(0,0,0,0.35)]' : 'rounded-r-md shadow-[inset_10px_0_14px_-10px_rgba(0,0,0,0.35)]',
      )}
    >
      {children}
      <span className={cn('absolute bottom-1.5 text-[8px] font-mono text-[#2b2118]/60', side === 'l' ? 'left-2.5' : 'right-2.5')}>{n}</span>
    </div>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-[0.2em] border-b-2 border-[#2b2118]/70 pb-1 mb-1.5">{children}</p>;
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[9.5px] leading-[16px]">
      <span className="uppercase tracking-wider text-[#2b2118]/70 truncate">{label}</span>
      <span className="font-mono font-bold whitespace-nowrap">{value}</span>
    </div>
  );
}

/** The dashed "write in it" button at the foot of a section's last page. */
export function PageButton({ onClick, children, className }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('mt-auto mb-1 mx-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border-2 border-dashed border-[#2b2118]/60 text-[9px] font-bold uppercase tracking-wider active:scale-95', className)}
    >
      {children}
    </button>
  );
}

export function fmtDate(ms: number | string) {
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
}
