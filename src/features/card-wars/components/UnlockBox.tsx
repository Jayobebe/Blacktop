import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { tr } from '@/lib/i18n';
import { refreshShop } from '../lib/shop';

/**
 * A code box nobody is shown: it appears when the deck page's Potential button
 * is held for three seconds. The server takes one code (`cw_unlock_all`,
 * migration 20261022000000), for one account, and gives that account every
 * card, dog tag and Redline. Anything else typed here does nothing.
 */
export function UnlockBox({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (demoBlocked()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('cw_unlock_all' as never, { _code: code.trim() } as never);
    setBusy(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) return void toast.error(tr("Could not check that code"));
    await refreshShop();
    toast.success(tr("Done"));
    onDone();
  };

  return (
    <div className="flex gap-2 mb-3">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 40))}
        placeholder={tr("Code")}
        aria-label={tr("Code")}
        className="h-11 font-mono uppercase"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        disabled={busy}
      />
      <Button className="h-11 px-5" disabled={busy || !code.trim()} onClick={() => void send()}>
        {tr("Redeem")}
      </Button>
    </div>
  );
}
