import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { useExperience } from '../../hooks/useExperience';
import type { RideMode, RideStyle } from '../../lib/profile';
import type { VehicleType } from '../../lib/vehicles';
import { termsFor } from '../../lib/terms';
import { careContext, orderedQuestions } from '../../lib/questions';
import { SETUP_STEPS, stepCopy } from '../../lib/stepCopy';
import { SetupShell } from './SetupShell';
import { VehicleStep, ModeStep, StyleStep } from './SetupSteps';
import { CareDeck } from './CareDeck';
import { ExperiencePreview } from './ExperiencePreview';
import { tr } from '@/lib/i18n';

interface SetupFlowProps {
  /** Called when the user backs out of the first step. */
  onExit?: () => void;
  /** Called after the preview step. */
  onDone: () => void;
  doneLabel?: string;
  /** Lets a host flow (onboarding) fold these steps into its own progress bar. */
  progressOffset?: number;
  progressTotal?: number;
  /** Direction of the step that led here, so the first step animates the right way. */
  initialDirection?: 'forward' | 'back';
  /** Start on the preview (used when returning from a later host step). */
  startAtEnd?: boolean;
}

/**
 * Vehicles → ride mode → style → "Do you care about…" deck → preview.
 * Every answer is applied the moment it's given (experience store +
 * AppSettings), so the preview is live and backing out keeps what was chosen.
 */
export function SetupFlow({
  onExit,
  onDone,
  doneLabel = tr("Looks good"),
  progressOffset = 0,
  progressTotal = SETUP_STEPS.length,
  initialDirection = 'forward',
  startAtEnd = false,
}: SetupFlowProps) {
  const exp = useExperience();
  const prefilled = exp.configured || startAtEnd;
  const [index, setIndex] = useState(startAtEnd ? SETUP_STEPS.length - 1 : 0);
  const [direction, setDirection] = useState<'forward' | 'back'>(initialDirection);
  // First-time setup starts unanswered so nobody breezes past with defaults.
  const [vehicles, setVehicles] = useState<VehicleType[]>(prefilled ? exp.vehicles : []);
  const [mode, setMode] = useState<RideMode | null>(prefilled ? exp.rideMode : null);
  const [style, setStyle] = useState<RideStyle | null>(prefilled ? exp.style : null);
  const [card, setCard] = useState(0);

  const step = SETUP_STEPS[index];
  const effectiveVehicles = vehicles.length > 0 ? vehicles : exp.vehicles;
  const terms = termsFor(effectiveVehicles);
  const context = careContext(effectiveVehicles, mode ?? exp.rideMode, terms);
  const copy = stepCopy(step, terms);
  // Freeze the deck order once the style is known so cards don't reshuffle mid-deck.
  const questions = useMemo(() => orderedQuestions(context, style), [style, effectiveVehicles.join(','), mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const canContinue =
    (step === 'vehicle' && vehicles.length > 0) ||
    (step === 'mode' && mode !== null) ||
    (step === 'style' && style !== null) ||
    step === 'care' ||
    step === 'preview';

  const goTo = (next: number, dir: 'forward' | 'back') => {
    setDirection(dir);
    setIndex(next);
  };

  const next = () => {
    if (!canContinue) return;
    if (step === 'preview') {
      haptics.success();
      exp.markConfigured();
      onDone();
      return;
    }
    if (step === 'style') setCard(0);
    goTo(index + 1, 'forward');
  };

  const back = () => {
    if (step === 'care' && card > 0) {
      setDirection('back');
      setCard(card - 1);
      return;
    }
    if (step === 'preview') setCard(Math.max(0, questions.length - 1));
    if (index === 0) {
      onExit?.();
      return;
    }
    goTo(index - 1, 'back');
  };

  const continueLabel = step === 'preview' ? doneLabel : 'Continue';

  return (
    <SetupShell
      stepKey={step}
      direction={direction}
      progress={{ current: progressOffset + index + 1, total: progressTotal }}
      onBack={index === 0 && !onExit ? undefined : back}
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={step === 'care' ? undefined : copy.subtitle}
      footer={
        step === 'care' ? (
          <button
            type="button"
            onClick={() => goTo(index + 1, 'forward')}
            className="w-full text-center text-sm text-muted-foreground py-2 hover:text-foreground"
          >
            {tr("Skip the rest")}
          </button>
        ) : (
          <Button onClick={next} disabled={!canContinue} className="w-full h-14 text-base font-semibold rounded-2xl touch-target">
            {continueLabel}
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        )
      }
    >
      {step === 'vehicle' && (
        <VehicleStep
          value={vehicles}
          onToggle={(v) => {
            const nextVehicles = vehicles.includes(v) ? vehicles.filter((x) => x !== v) : [...vehicles, v];
            setVehicles(nextVehicles);
            if (nextVehicles.length > 0) exp.setVehicles(nextVehicles);
          }}
        />
      )}
      {step === 'mode' && (
        <ModeStep
          value={mode}
          terms={terms}
          onChange={(m) => {
            setMode(m);
            exp.setRideMode(m);
          }}
        />
      )}
      {step === 'style' && (
        <StyleStep
          value={style}
          terms={terms}
          onChange={(s) => {
            setStyle(s);
            exp.setStyle(s);
          }}
        />
      )}
      {step === 'care' && (
        <CareDeck
          questions={questions}
          index={card}
          context={context}
          style={style}
          onAnswered={() => {
            if (card >= questions.length - 1) {
              goTo(index + 1, 'forward');
            } else {
              setCard(card + 1);
            }
          }}
        />
      )}
      {step === 'preview' && (
        <ExperiencePreview profile={{ vehicles: effectiveVehicles, rideMode: mode ?? exp.rideMode, style, configured: true }} />
      )}
    </SetupShell>
  );
}
