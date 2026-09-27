import { cn } from '@/lib/utils';

/**
 * Cartoon leather-bound logbook, receipts spilling out of the top — sits in
 * the garage under the vehicle controls. Tapping it opens the book.
 */
export function LogbookCover({ vehicleName, onOpen, className }: { vehicleName: string; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open the ${vehicleName} logbook`}
      className={cn('group relative mx-auto block w-40 h-56 active:scale-[0.97] transition-transform', className)}
    >
      {/* Receipts overflowing from the pages */}
      {[
        { left: '18%', rot: -14, top: '-2%', h: '34%' },
        { left: '44%', rot: 6, top: '-7%', h: '38%' },
        { left: '64%', rot: 18, top: '1%', h: '30%' },
      ].map((r, i) => (
        <div
          key={i}
          className="absolute w-12 rounded-sm border-2 border-black/80 bg-[#fbf7ee] shadow-md transition-transform duration-300 group-hover:-translate-y-1"
          style={{ left: r.left, top: r.top, height: r.h, transform: `rotate(${r.rot}deg)` }}
        >
          <div className="mx-1.5 mt-2 space-y-1">
            <div className="h-[2px] bg-black/40 w-3/4" />
            <div className="h-[2px] bg-black/25" />
            <div className="h-[2px] bg-black/25 w-2/3" />
            <div className="h-[2px] bg-black/25 w-5/6" />
          </div>
        </div>
      ))}

      {/* Page block peeking out on the right */}
      <div className="absolute right-0 top-[16%] bottom-[3%] w-[92%] rounded-r-lg border-2 border-black/80 bg-[#efe3c4] [background-image:repeating-linear-gradient(0deg,transparent_0,transparent_3px,rgba(0,0,0,0.12)_3px,rgba(0,0,0,0.12)_4px)]" />

      {/* Leather cover */}
      <div className="absolute left-0 top-[14%] bottom-0 right-[4%] rounded-l-md rounded-r-xl border-[3px] border-black/85 bg-gradient-to-br from-[#8a4b25] via-[#6d3819] to-[#4a230e] shadow-[4px_5px_0_rgba(0,0,0,0.55)] overflow-hidden">
        {/* spine */}
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-[#3b1b09] to-[#5a2c13] border-r-2 border-black/50" />
        {/* stitching */}
        <div className="absolute left-6 right-2 top-2 bottom-2 rounded-lg border-2 border-dashed border-[#e2b877]/70" />
        {/* leather grain */}
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(0,0,0,0.5)_1px,transparent_1px)] [background-size:5px_5px]" />
        {/* corner protectors */}
        <div className="absolute right-0 top-0 w-5 h-5 bg-[#c9a24e] border-l-2 border-b-2 border-black/70 rounded-bl-md" />
        <div className="absolute right-0 bottom-0 w-5 h-5 bg-[#c9a24e] border-l-2 border-t-2 border-black/70 rounded-tl-md" />
        {/* title plate */}
        <div className="absolute left-7 right-3 top-[26%] flex flex-col items-center">
          <span className="text-[17px] font-black tracking-[0.2em] text-[#f0cf83] [text-shadow:0_2px_0_rgba(0,0,0,0.6),0_-1px_0_rgba(255,236,190,0.35)]">
            LOGBOOK
          </span>
          <div className="mt-1 h-[2px] w-16 bg-[#f0cf83]/70" />
          <span className="mt-2 max-w-full truncate text-[9px] font-bold uppercase tracking-widest text-[#f0cf83]/80">
            {vehicleName}
          </span>
        </div>
        {/* strap */}
        <div className="absolute right-3 top-[58%] w-8 h-5 rounded-l-md bg-[#3b1b09] border-2 border-black/70">
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#c9a24e] border border-black/60" />
        </div>
      </div>
    </button>
  );
}
