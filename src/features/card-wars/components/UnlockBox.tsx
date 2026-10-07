import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/lib/demoMode';
import { tr } from '@/lib/i18n';
import { refreshShop } from '../lib/shop';

/**
 * TEMPORARY (2026-10-07): a code box for one test account. The server takes
 * one code, once (`cw_unlock_all`, migration 20261022000000), and gives that
 * account every card and dog tag. The box only shows while the server says the
 * code is unused, so it's gone for everyone the moment it's entered. Remove
 * this file, its line in CardWarsScreen and the two server functions after.
 */
export function UnlockBox() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isDemoModeActive()) return;
    let gone = false;
    void supabase.rpc('cw_unlock_open' as never).then(({ data, error }) => {
      if (!gone && !error && data === true) setOpen(true);
    });
    return () => {
      gone = true;
    };
  }, []);
  if (!open) return null;

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('cw_unlock_all' as never, { _code: code.trim() } as never);
    setBusy(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) return void toast.error(tr("Could not check that code"));
    setOpen(false);
    await refreshShop();
    toast.success(tr("Done"));
  };

  return (
    <div className="flex gap-2 mb-4">
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
