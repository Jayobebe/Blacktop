import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { HeaderButton } from '@/components/PageHeader';
import { EnterpriseDoorway } from '@/features/enterprise/components/EnterpriseDoorway';
import { haptics } from '@/lib/haptics';
import { tr } from '@/lib/i18n';

/**
 * Blacktop Enterprise before there's an account: the welcome screen's
 * Enterprise button opens this, the Doorway by itself (the page that is
 * otherwise the last card of Home's deck). Nothing of Home is here, because
 * someone who hasn't set Blacktop up has no Home yet; Back returns to the
 * welcome screen.
 */
export default function EnterpriseWelcome() {
  const navigate = useNavigate();
  return (
    <div className="h-dvh flex flex-col safe-top safe-bottom max-w-lg mx-auto">
      <div className="px-3 pt-3 shrink-0">
        <HeaderButton
          aria-label={tr("Back")}
          onClick={() => {
            haptics.tick();
            navigate('/');
          }}
        >
          <ChevronLeft className="w-5 h-5 -ml-0.5" strokeWidth={2.25} />
        </HeaderButton>
      </div>
      <div className="flex-1 min-h-0 p-3">
        <EnterpriseDoorway className="h-full" />
      </div>
    </div>
  );
}
