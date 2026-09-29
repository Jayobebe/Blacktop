import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { mountWorkspace, parseEnterpriseCode, verifyEnterpriseCode } from '@/features/enterprise';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';

/**
 * Deep link: /enterprise?org=…&token=… (what an enterprise QR opens when
 * scanned with the phone's own camera). Checks the code, mounts the
 * workspace and goes Home, where the deck shows it.
 */
export default function EnterpriseLink() {
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const payload = parseEnterpriseCode(window.location.href);
    (async () => {
      if (!payload) {
        toast.error(tr("That isn't a Blacktop Enterprise code"));
      } else {
        const res = await verifyEnterpriseCode(payload.token);
        if (res.ok) {
          const isNew = mountWorkspace(res.session);
          haptics.success();
          if (isNew) toast.success(tr("Connected to {0}", [res.session.org.name]));
          else toast(tr("{0} is already open", [res.session.org.name]));
        } else {
          haptics.error();
          toast.error(tr("That code isn't valid or has expired."));
        }
      }
      navigate('/', { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="h-dvh flex items-center justify-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 animate-spin text-accent" />
      {tr("Checking…")}
    </div>
  );
}
