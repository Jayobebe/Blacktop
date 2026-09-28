import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SetupFlow } from '@/features/experience';
import { tr } from '@/lib/i18n';

/** Re-run the vehicle / ride mode / goals setup from Settings. */
export default function Setup() {
  const navigate = useNavigate();
  return (
    <SetupFlow
      onExit={() => navigate(-1)}
      onDone={() => {
        toast.success(tr("Your Blacktop is updated"));
        navigate('/', { replace: true });
      }}
      doneLabel="Save and go home"
    />
  );
}
