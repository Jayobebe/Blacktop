import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { RESCUE_RADIUS_OPTIONS_KM } from '@/features/rescue';
import { useNavigation } from '@/hooks/useNavigation';
import { useRideHistory } from '@/features/ride';
import {
  useSettings,
  AccentColorPicker,
  AUTO_RESCUE_MIN_G_THRESHOLD,
  AUTO_RESCUE_MAX_G_THRESHOLD,
  AUTO_RESCUE_MIN_STOP_WINDOW_SEC,
  AUTO_RESCUE_MAX_STOP_WINDOW_SEC,
} from '@/features/settings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { BTLogo } from '@/components/BTLogo';
import { ArrowLeft, Flame, Navigation, Shield, ExternalLink, Eye, Gauge, Pencil, Heart, Palette, AlertTriangle, Video, CloudRain, MessageSquare, ChevronDown, Globe2, Play, MonitorSmartphone, Radio, Sparkles, User, Users, Repeat, Bell, Volume2, Megaphone
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { NavigationApp } from '@/types/blacktop';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DiscordSettingsCard } from '@/features/integrations/discord';
import { openBlacktopMap } from '@/features/map';
import { useGarage } from '@/features/garage';
import { BurnFlameOverlay, markBurnReveal } from '@/components/BurnFlameOverlay';
import { LanguagePicker } from '@/components/LanguagePicker';
import { getBlocked, clearBlocked } from '@/features/proximity';
import { CollapsibleSection } from '@/features/settings/components/CollapsibleSection';
import { NotificationSettings, usePush, disablePush } from '@/features/notifications';
import { clearSurveyAnswers, SurveyResultsTable } from '@/features/speedshop';
import { useDemoMode, setDemoMode } from '@/lib/demoMode';
import { StationManager, useRadioStations, burnRadioStations, resetRadio } from '@/features/radio';
import { NimiqTipCard } from '@/features/tips';
import { CareList, useExperience, VEHICLES, VEHICLE_ORDER, RIDE_STYLES, type RideMode } from '@/features/experience';
import { PageHeader, HeaderButton } from '@/components/PageHeader';
import { tr } from '@/lib/i18n';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, updateName, resetIdentity } = useProfile();
  const { preferredNavApp, updateNavApp } = useNavigation();
  const [blockedRiders, setBlockedRiders] = useState(() => getBlocked().length);
  const { burnAllData, stats } = useRideHistory();
  const { burnGarage } = useGarage();
  const exp = useExperience();
  const { settings, toggleSpeedUnit, toggleDistanceUnit, updateSetting, updateSettings, toggleLeanAngle, setLeanAngleThreshold } = useSettings();
  const { stations: radioStations } = useRadioStations();
  const [showStations, setShowStations] = useState(false);
  const [burnStep, setBurnStep] = useState(0);
  const [burning, setBurning] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(profile.name);
  
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { enabled: demoEnabled } = useDemoMode();
  const [demoActionRevealed, setDemoActionRevealed] = useState(false);
  const [demoHoldProgress, setDemoHoldProgress] = useState(0);
  // The BT logo: a tap opens the language picker, a 3 s hold reveals the demo toggle.
  const [languageOpen, setLanguageOpen] = useState(false);
  const demoHoldStartRef = useRef<number | null>(null);
  const demoHoldRafRef = useRef<number | null>(null);

  const cancelDemoHold = () => {
    demoHoldStartRef.current = null;
    if (demoHoldRafRef.current != null) {
      cancelAnimationFrame(demoHoldRafRef.current);
      demoHoldRafRef.current = null;
    }
    setDemoHoldProgress(0);
  };

  const startDemoHold = () => {
    demoHoldStartRef.current = performance.now();
    const tick = () => {
      if (demoHoldStartRef.current == null) return;
      const elapsed = performance.now() - demoHoldStartRef.current;
      const pct = Math.min(1, elapsed / 3000);
      setDemoHoldProgress(pct);
      if (pct >= 1) {
        setDemoActionRevealed(true);
        cancelDemoHold();
        return;
      }
      demoHoldRafRef.current = requestAnimationFrame(tick);
    };
    demoHoldRafRef.current = requestAnimationFrame(tick);
  };

  const handleToggleDemoMode = () => {
    const next = !demoEnabled;
    setDemoMode(next);
    toast.success(next ? tr("Demo data injected.") : tr("Personal stats restored."));
    setDemoActionRevealed(false);
  };

  useEffect(() => () => cancelDemoHold(), []);

  useEffect(() => {
    const tipStatus = searchParams.get('tip');
    if (tipStatus === 'success') {
      toast.success(tr("Thank you for your support!"));
    }
  }, [searchParams]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSave = () => {
    if (editedName.trim() && editedName.trim() !== profile.name) {
      updateName(editedName.trim());
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setEditedName(profile.name);
      setIsEditingName(false);
    }
  };

  const navApps: { id: NavigationApp; label: string }[] = [
    { id: 'google', label: tr("Google Maps") },
    { id: 'waze', label: tr("Waze") },
    { id: 'apple', label: tr("Apple Maps") },
    { id: 'blacktop', label: tr("Blacktop Maps") },
  ];


  const [burnOrigin, setBurnOrigin] = useState<{ x: number; y: number } | null>(null);
  // Belt-and-suspenders against a same-tick double-fire (e.g. a script
  // dispatching multiple click events before React re-renders the `disabled`
  // prop) - `burning` state alone can't catch that since it only takes
  // effect after the next render.
  const burnLockRef = useRef(false);
  // Demo or real is decided once, when the burn is confirmed. The demo burn
  // switches demo mode off partway through, so reading `demoEnabled` later
  // would turn it into a real burn (it did: the demo burn wiped real data).
  const [burnKind, setBurnKind] = useState<'demo' | 'real' | null>(null);
  const burnKindRef = useRef<'demo' | 'real' | null>(null);

  const handleBurn = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (burnStep === 0) {
      setBurnStep(1);
    } else if (burnStep === 1) {
      if (burnLockRef.current) return;
      burnLockRef.current = true;

      // Capture the button's center as the flame origin
      const rect = e.currentTarget.getBoundingClientRect();
      setBurnOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      const kind = demoEnabled ? 'demo' : 'real';
      burnKindRef.current = kind;
      setBurnKind(kind);
      setBurning(true);

      if (kind === 'demo') {
        // Burning the demo account just takes the rider back to their own
        // account. Never touch real ride/garage data or the auth identity here.
        return;
      }
      try {
        // Together these two cover every input a Ride History receipt is
        // built from (ride stats/badges/G-data + bike name/photo) - receipts
        // aren't stored separately, so this also wipes the receipt bank.
        burnAllData();
        burnGarage();
        // Drop this device's push subscription (the server copy also goes with the account).
        void disablePush();
        clearSurveyAnswers();
        // Radio stations only reference local files, but the list itself goes too.
        resetRadio();
        void burnRadioStations();

      } catch (err) {
        console.error('Burn failed:', err);
      }
    }
  };

  const handleBurnPeak = async () => {
    // Screen is fully covered by flame/smoke — safe to swap routes underneath.
    const kind = burnKindRef.current;
    if (kind !== 'real') {
      // Demo burn (or a stray second peak): back to the rider's own account, nothing deleted.
      if (kind === 'demo') {
        setDemoMode(false);
        toast.success(tr("Back to your account"), { description: tr("Demo data cleared. Your own data is untouched.") });
      }
      setBurnStep(0);
      burnLockRef.current = false;
      return;
    }
    // One real burn per confirm, whatever the animation does.
    burnKindRef.current = null;
    try {
      await resetIdentity();
    } catch (e) {
      console.error('Identity reset failed:', e);
    }
    // A full reload, not a route change: in-memory stores (tracks, pins,
    // crew, convoy…) start empty too, not just what's on disk. The fresh app
    // finishes the flames (BurnReveal), so the reload happens under full cover.
    markBurnReveal();
    window.location.replace('/');
  };

  const handleBurnComplete = () => {
    setBurning(false);
    setBurnKind(null);
    burnKindRef.current = null;
  };

  const handleOpenNavApp = (appId: NavigationApp) => {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    let appUrl = '';
    let fallbackUrl = '';
    
    if (appId === 'google') {
      appUrl = 'https://www.google.com/maps';
      fallbackUrl = isIOS 
        ? 'https://apps.apple.com/app/google-maps/id585027354'
        : isAndroid 
          ? 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps'
          : 'https://www.google.com/maps';
    } else if (appId === 'apple') {
      appUrl = 'https://maps.apple.com/';
      fallbackUrl = isIOS 
        ? 'https://maps.apple.com/'
        : 'https://www.apple.com/maps/';
    } else if (appId === 'waze') {
      appUrl = 'https://waze.com/ul';
      fallbackUrl = isIOS 
        ? 'https://apps.apple.com/app/waze-navigation-live-traffic/id323229106'
        : isAndroid 
          ? 'https://play.google.com/store/apps/details?id=com.waze'
          : 'https://www.waze.com/download';
    }
    
    const newWindow = window.open(appUrl, '_blank');
    
    if ((isIOS || isAndroid) && newWindow) {
      setTimeout(() => {
        if (document.hidden === false && appUrl !== fallbackUrl) {
          window.open(fallbackUrl, '_blank');
        }
      }, 1500);
    }
  };

  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <PageHeader
        title={tr("Settings")}
        backTo="/"
        right={
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); startDemoHold(); }}
            onPointerUp={() => {
              const held = demoHoldStartRef.current != null ? performance.now() - demoHoldStartRef.current : Infinity;
              cancelDemoHold();
              if (held < 450) setLanguageOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setLanguageOpen(true);
              }
            }}
            onPointerLeave={cancelDemoHold}
            onPointerCancel={cancelDemoHold}
            onContextMenu={(e) => e.preventDefault()}
            className="relative rounded-lg touch-target select-none"
            aria-label={tr("Language (hold for demo data)")}
            style={{ WebkitTouchCallout: 'none' }}
          >
            <BTLogo size="md" />
            {demoHoldProgress > 0 && demoHoldProgress < 1 && (
              <span
                className="pointer-events-none absolute inset-0 rounded-lg border-2 border-accent"
                style={{ opacity: 0.3 + demoHoldProgress * 0.7 }}
              />
            )}
          </button>
        }
      />

      {/* Demo data toggle — only visible after a 3s long-press on the BT logo */}
      {demoActionRevealed && (
        <div className="mb-3 landscape:mb-2 flex-shrink-0 animate-slide-up">
          <button
            onClick={handleToggleDemoMode}
            className="w-full px-4 py-3 rounded-2xl bg-accent/10 border border-accent/40 text-accent text-sm font-semibold tracking-wide hover:bg-accent/20 transition-colors"
          >
            {demoEnabled ? tr("Revert to personal stats") : tr("Inject demo data")}
          </button>
        </div>
      )}


      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3 landscape:space-y-2">
        {/* Profile Section */}
        <section className="bg-card rounded-[20px] border border-white/[0.06] animate-slide-up h-[64px] landscape:h-14 flex items-center px-4 landscape:px-3">
          {isEditingName ? (
            <div className="flex-1 flex items-center h-full">
              <Input
                ref={nameInputRef}
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={handleNameKeyDown}
                maxLength={20}
                className="text-sm font-medium h-9 rounded-lg bg-background/50 border-border/30 flex-1"
                placeholder={tr("Enter your name")}
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setEditedName(profile.name);
                setIsEditingName(true);
              }}
              className="flex items-center justify-between w-full h-full text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[15px] font-semibold shrink-0">
                  {profile.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[15px] font-semibold truncate">{profile.name}</span>
                  <span className="text-[12px] text-muted-foreground">{tr("Tap to change your name")}</span>
                </div>
              </div>
              <Pencil className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
            </button>
         )}
        </section>

        {/* Settings grid */}
        {/* Single column: sections expand in place, so there are never half-empty rows. */}
        <div className="grid grid-cols-2 gap-3">
          {/* Demo */}
          <CollapsibleSection
            icon={Play}
            label={tr("Demo")} index={0}
            delayClass="delay-75"
            rightElement={<Play className="w-4 h-4 text-accent" />}
            onHeaderClick={() => navigate('/demo')}
          />

          {/* Setup answers — same choices as onboarding, applied instantly */}
          <CollapsibleSection icon={Sparkles} label={tr("Your Blacktop")} index={1} delayClass="delay-75">
            <div className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground mb-2">{tr("What you")}{" "}{exp.terms.ride} <span className="opacity-60">{tr("(first is your main)")}</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {VEHICLE_ORDER.map((v) => {
                    const info = VEHICLES[v];
                    const order = exp.vehicles.indexOf(v);
                    const on = order !== -1;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => exp.toggleVehicle(v)}
                        className={cn(
                          'pressable flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium',
                          on ? 'bg-accent text-accent-foreground border-accent' : 'border-border/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <info.icon className="w-4 h-4" />
                        {info.label}
                        {order === 0 && exp.vehicles.length > 1 && <span className="text-[9px] uppercase tracking-wider opacity-80">{tr("· main")}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">{tr("Who you")}{" "}{exp.terms.ride}{" "}{tr("with")}</p>
                <SegmentedChoice<RideMode>
                  value={exp.rideMode}
                  onChange={exp.setRideMode}
                  options={[
                    { id: 'solo', label: tr("Just me"), icon: User },
                    { id: 'group', label: tr("My crew"), icon: Users },
                    { id: 'both', label: tr("Both"), icon: Sparkles },
                  ]}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">{tr("Typical")}{" "}{exp.terms.ride}</p>
                <div className="flex flex-wrap gap-1.5">
                  {RIDE_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      role="radio"
                      aria-checked={exp.style === st.id}
                      onClick={() => exp.setStyle(st.id)}
                      className={cn(
                        'pressable flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium',
                        exp.style === st.id ? 'bg-accent text-accent-foreground border-accent' : 'border-border/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <st.icon className="w-3.5 h-3.5" />
                      {st.title(exp.terms)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{tr("What you care about")}</p>
                <CareList />
              </div>
              <Button variant="outline" className="w-full rounded-2xl" onClick={() => navigate('/setup')}>
                <Repeat className="w-4 h-4" />
                {tr("Redo full setup")}
              </Button>
            </div>
          </CollapsibleSection>

          {/* Safety */}
        <CollapsibleSection icon={AlertTriangle} label={tr("Safety")} index={2} delayClass="delay-100">
          <div className="space-y-5">
            {/* Speed Alerts — they colour the live speed readout, so only for speed-focused riders */}
            {settings.speedFocusEnabled && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">{tr("Speed Alerts")}</p>
              {(() => {
                const u = settings.speedUnit;
                const label = getSpeedLabel(u);
                // Convert stored mph thresholds to displayed unit
                const toDisplay = (mph: number) => formatSpeed(mph, u);
                const fromDisplay = (display: number) =>
                  u === 'kph' ? Math.round(display / 1.60934) : display;
                const sliderMin = u === 'kph' ? 40 : 25;
                const sliderMax = u === 'kph' ? 400 : 250;
                const sliderStep = u === 'kph' ? 5 : 5;
                const amberDisplay = toDisplay(settings.amberSpeedThreshold);
                const redDisplay = toDisplay(settings.redSpeedThreshold);
                return (
                  <div className="space-y-5">
                    {/* Amber threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-warning">{tr("Amber Warning")}</p>
                          <p className="text-[10px] text-muted-foreground">{tr("Display turns amber")}</p>
                        </div>
                        <span className="font-mono text-sm font-bold text-warning">
                          {amberDisplay} {label}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={sliderMin}
                        max={sliderMax}
                        step={sliderStep}
                        value={amberDisplay}
                        onChange={(e) => {
                          const newAmberMph = fromDisplay(Number(e.target.value));
                          updateSetting('amberSpeedThreshold', newAmberMph);
                          if (settings.redSpeedThreshold <= newAmberMph) {
                            updateSetting('redSpeedThreshold', Math.min(newAmberMph + 10, 250));
                          }
                        }}
                        className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer slider-amber"
                      />
                    </div>

                    {/* Red threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-destructive">{tr("Red Alert")}</p>
                          <p className="text-[10px] text-muted-foreground">{tr("Display turns red")}</p>
                        </div>
                        <span className="font-mono text-sm font-bold text-destructive">
                          {redDisplay} {label}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={sliderMin}
                        max={sliderMax}
                        step={sliderStep}
                        value={redDisplay}
                        onChange={(e) => {
                          const newRedMph = fromDisplay(Number(e.target.value));
                          if (newRedMph > settings.amberSpeedThreshold) {
                            updateSetting('redSpeedThreshold', newRedMph);
                          }
                        }}
                        className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer slider-red"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            )}

            {/* Auto Rescue */}
            <div className={cn(settings.speedFocusEnabled && 'border-t border-border/30 pt-4')}>
              <p className="text-xs text-muted-foreground mb-3">{tr("Auto Rescue")}</p>
              <div className="flex items-center justify-between mb-2">
                <div className="pr-3">
                  <p className="text-sm font-medium">{tr("Crash detection")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {tr("If a hard impact is followed by a stop, the app asks \"Are you okay?\". No reply in 5 min → rescue ping fires to your whole convoy and Discord (if connected). Works on solo rides too (Discord only).")}
                  </p>
                </div>
                <Switch
                  checked={settings.autoRescueEnabled}
                  onCheckedChange={async (v) => {
                    if (v) {
                      // iOS 13+: motion permission must be requested from a user gesture
                      const anyMotion = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
                      if (anyMotion && typeof anyMotion.requestPermission === 'function') {
                        try {
                          const res = await anyMotion.requestPermission();
                          if (res !== 'granted') {
                            toast.error(tr("Motion sensor permission denied"));
                            return;
                          }
                        } catch {
                          toast.error(tr("Could not enable motion sensor"));
                          return;
                        }
                      }
                    }
                    updateSetting('autoRescueEnabled', v);
                  }}
                />
              </div>

              {settings.autoRescueEnabled && (
                <div className="pt-3 border-t border-border/30 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{tr("Impact sensitivity")}</p>
                      <span className="font-mono text-sm font-bold text-accent">
                        {settings.autoRescueGThreshold}{" "}{tr("G")}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={AUTO_RESCUE_MIN_G_THRESHOLD}
                      max={AUTO_RESCUE_MAX_G_THRESHOLD}
                      step={0.5}
                      value={settings.autoRescueGThreshold}
                      onChange={(e) => updateSetting('autoRescueGThreshold', Number(e.target.value))}
                      className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-[hsl(var(--accent))]"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>{AUTO_RESCUE_MIN_G_THRESHOLD}{" "}{tr("G (sensitive)")}</span>
                      <span>{AUTO_RESCUE_MAX_G_THRESHOLD}{" "}{tr("G (only crashes)")}</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{tr("Stop window after impact")}</p>
                      <span className="font-mono text-sm font-bold text-accent">
                        {settings.autoRescueStopWindowSec}{tr("s")}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={AUTO_RESCUE_MIN_STOP_WINDOW_SEC}
                      max={AUTO_RESCUE_MAX_STOP_WINDOW_SEC}
                      step={1}
                      value={settings.autoRescueStopWindowSec}
                      onChange={(e) => updateSetting('autoRescueStopWindowSec', Number(e.target.value))}
                      className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer accent-[hsl(var(--accent))]"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>{AUTO_RESCUE_MIN_STOP_WINDOW_SEC}{tr("s")}</span>
                      <span>{AUTO_RESCUE_MAX_STOP_WINDOW_SEC}{tr("s")}</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    {tr("Acknowledge timeout:")}{" "}<span className="font-mono">5:00</span>
                  </p>
                </div>
              )}
            </div>

            {/* Who the rescue triangle (and auto-rescue after a crash) reaches. */}
            <div className="pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-1">{tr("Who your rescue call reaches")}</p>
              <p className="text-[11px] text-muted-foreground/80 mb-3">{tr("The rescue button on the map and ride screen, and auto-rescue after a crash.")}</p>
              <div className="space-y-3">
                {(
                  [
                    ['rescueToConvoy', 'Your convoy', 'Everyone you’re riding with: an alert card, your location and a route to you.'],
                    ['rescueToCrew', 'Your crew', 'A push to your crew mates’ phones, even with the app closed.'],
                    ['rescueToDiscord', 'Discord', 'A post in your connected Discord channel.'],
                    ['rescueToNearby', 'Riders nearby', 'Other Blacktop riders close by who’ve opted in to help (Notifications → Riders near me who need help).'],
                  ] as const
                ).map(([key, title, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <div className="pr-2">
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    <Switch checked={settings[key]} onCheckedChange={(v) => updateSetting(key, v)} />
                  </div>
                ))}
                {settings.rescueToNearby && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1.5">{tr("How far to reach (about: riders’ areas are rounded to ~11 km)")}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {RESCUE_RADIUS_OPTIONS_KM.map((km) => (
                        <button
                          key={km}
                          onClick={() => updateSetting('rescueNearbyKm', km)}
                          className={cn(
                            'h-9 rounded-lg border text-xs font-mono font-semibold',
                            settings.rescueNearbyKm === km ? 'border-accent bg-accent/15 text-foreground' : 'border-border text-muted-foreground',
                          )}
                        >
                          {km}{" "}{tr("km")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CollapsibleSection>

         {/* Ride Metrics Section */}
         <CollapsibleSection icon={Gauge} label={tr("Ride Metrics")} index={3} delayClass="delay-200">
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm font-medium">{tr("Speed")}</p>
                 <p className="text-[10px] text-muted-foreground">{tr("Currently")}{" "}{getSpeedLabel(settings.speedUnit)}</p>
               </div>
               <button
                 onClick={toggleSpeedUnit}
                 className="px-4 py-2 rounded-xl bg-secondary hover:bg-muted transition-colors font-mono font-semibold text-sm"
               >
                 {getSpeedLabel(settings.speedUnit)}
               </button>
             </div>
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm font-medium">{tr("Distance")}</p>
                 <p className="text-[10px] text-muted-foreground">{tr("Currently")}{" "}{getDistanceLabel(settings.distanceUnit)}</p>
               </div>
               <button
                 onClick={toggleDistanceUnit}
                 className="px-4 py-2 rounded-xl bg-secondary hover:bg-muted transition-colors font-mono font-semibold text-sm"
               >
                 {getDistanceLabel(settings.distanceUnit).toUpperCase()}
               </button>
             </div>
           </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
              <div>
                <p className="text-sm font-medium">{tr("Enable G-Force Gauge")}</p>
                <p className="text-[10px] text-muted-foreground">{tr("Live G-force gauge and max-G tracking during rides")}</p>
              </div>
              <Switch
                checked={settings.gForceEnabled}
                onCheckedChange={async (v) => {
                  if (v) {
                    // iOS 13+: motion permission must be requested from a user gesture
                    const anyMotion = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
                    if (anyMotion && typeof anyMotion.requestPermission === 'function') {
                      try {
                        const res = await anyMotion.requestPermission();
                        if (res !== 'granted') {
                          toast.error(tr("Motion sensor permission denied"));
                          return;
                        }
                      } catch {
                        toast.error(tr("Could not enable motion sensor"));
                        return;
                      }
                    }
                  }
                  updateSetting('gForceEnabled', v);
                }}
              />
            </div>

            {exp.canLean && (<>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
              <div>
                <p className="text-sm font-medium">{tr("Enable Lean Angle")}</p>
                <p className="text-[10px] text-muted-foreground">{tr("Track vehicle lean angle in real-time")}</p>
              </div>
              <Switch
                checked={settings.leanAngleEnabled}
                onCheckedChange={toggleLeanAngle}
              />
            </div>

            {settings.leanAngleEnabled && (
              <div className="pt-3 pb-4 border-t border-border/30 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-destructive">{tr("Warning Threshold")}</p>
                    <p className="text-[10px] text-muted-foreground">{tr("Arc glows red above this angle")}</p>
                  </div>
                  <span className="font-mono text-sm font-bold text-destructive">
                    {settings.leanAngleThreshold}°
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={90}
                  step={1}
                  value={settings.leanAngleThreshold}
                  onChange={(e) => setLeanAngleThreshold(Number(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer slider-red"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>20°</span>
                  <span>90°</span>
                </div>
              </div>
            )}
            </>)}

           <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
             <div>
               <p className="text-sm font-medium">{tr("3D Ride Flyover")}</p>
               <p className="text-[10px] text-muted-foreground">{tr("3D route overview button in ride history")}</p>
             </div>
             <Switch
               checked={settings.flyoverEnabled}
               onCheckedChange={() => updateSetting('flyoverEnabled', !settings.flyoverEnabled)}
             />
           </div>
           <div className="flex items-center justify-between mt-4">
             <div>
               <p className="text-sm font-medium">{tr("Ride Overlay")}</p>
               <p className="text-[10px] text-muted-foreground">{tr("Recorded overlay download in ride history")}</p>
             </div>
             <Switch
               checked={settings.rideOverlayEnabled}
               onCheckedChange={() => updateSetting('rideOverlayEnabled', !settings.rideOverlayEnabled)}
             />
           </div>
           {settings.rideOverlayEnabled && (
             <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
               <div>
                  <p className="text-sm font-medium">{tr("Voice Channel Recording")}</p>
                  <p className="text-[10px] text-muted-foreground">{tr("Add convoy voice audio to the recorded overlay. This also acts as your consent: riders with this off are never included in anyone else's recording — only riders who have it on can be heard.")}</p>
               </div>
               <Switch
                 checked={settings.voiceRecordingEnabled}
                 onCheckedChange={() => updateSetting('voiceRecordingEnabled', !settings.voiceRecordingEnabled)}
               />
             </div>
           )}
         </CollapsibleSection>


        {/* Navigation App Section */}
        <CollapsibleSection icon={Navigation} label={tr("Navigation")} index={4} delayClass="delay-200">
          <div className="space-y-2">
            {navApps.map((app) => {
              const isSelected = preferredNavApp === app.id;
              return (
                <div
                  key={app.id}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl border transition-colors",
                    isSelected
                      ? "border-accent/40 bg-accent/10"
                      : "border-border/30 bg-card/30"
                  )}
                >
                  <button
                    onClick={() => updateNavApp(app.id)}
                    className={cn(
                      "flex-1 text-left text-sm touch-target font-medium",
                      isSelected ? "text-accent" : "text-foreground hover:text-accent"
                    )}
                  >
                    {app.label}
                  </button>
                  <button
                    onClick={() => (app.id === 'blacktop' ? openBlacktopMap() : handleOpenNavApp(app.id))}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      isSelected
                        ? "text-accent hover:bg-accent/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    title={app.id === 'blacktop' ? tr("Preview Blacktop Maps") : tr("Open {0}", [app.label])}
                  >
                    {app.id === 'blacktop' ? <Eye className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            {tr("Blacktop opens your preferred app for directions")}
          </p>

          {preferredNavApp === 'blacktop' && (
            <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Volume2 className="w-4 h-4 text-accent" />
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Spoken Directions")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr("Reads each turn aloud while you navigate on the Blacktop map, and lowers the radio and crew voice while it speaks. The turn banner stays on screen either way.")}
                  </p>
                </div>
                <Switch
                  checked={settings.navVoiceEnabled}
                  onCheckedChange={(v) => updateSetting('navVoiceEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Video className="w-4 h-4 text-accent" />
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Traffic Cameras")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr("Show speed cameras &amp; ANPR poles on the map when zoomed in. Crowd-sourced from OpenStreetMap — informational only, coverage varies by area.")}
                  </p>
                </div>
                <Switch
                  checked={settings.trafficCamerasEnabled}
                  onCheckedChange={(v) => updateSetting('trafficCamerasEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CloudRain className="w-4 h-4 text-accent" />
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Weather Overlay")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr("Animated rain radar on the Blacktop map, powered by RainViewer.")}
                  </p>
                </div>
                <Switch
                  checked={settings.weatherOverlayEnabled}
                  onCheckedChange={(v) => updateSetting('weatherOverlayEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CloudRain className="w-4 h-4 text-accent" />
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Weather Routing")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr("Warns when heavy rain sits on your route and offers a drier line.")}
                  </p>
                </div>
                <Switch
                  checked={settings.weatherRoutingEnabled}
                  onCheckedChange={(v) => updateSetting('weatherRoutingEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-accent" />
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Nearby Riders")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr("When another opted-in rider rides near you for a bit, Blacktop offers to join up. Both of you have to accept, then you share a convoy with voice. Convoy leaders can merge convoys and either leader can unmerge. Your name and position are only shared with opted-in riders within a few km, and only while you ride.")}
                  </p>
                  {blockedRiders > 0 && (
                    <button
                      onClick={() => {
                        clearBlocked();
                        setBlockedRiders(0);
                        toast.success(tr("Blocked riders cleared"));
                      }}
                      className="mt-1.5 text-[11px] text-accent hover:underline"
                    >
                      {blockedRiders}{" "}{tr("blocked")}{" "}{blockedRiders === 1 ? 'rider' : 'riders'}{" "}{tr("· Clear")}
                    </button>
                  )}
                </div>
                <Switch
                  checked={settings.proximityEnabled}
                  onCheckedChange={(v) => updateSetting('proximityEnabled', v)}
                />
              </div>
            </div>
          )}

          {/* Hazard warnings run on the ride screen too, so this sits outside the Blacktop-map-only block. */}
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between gap-3">
              <div className="pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <Megaphone className="w-4 h-4 text-accent" />
                  <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Spoken Hazard Warnings")}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tr("Says it out loud when you're riding up to a reported hazard (\"Oil on the road ahead, 300 metres\") and lowers the radio and crew voice while it speaks. The warning banner shows either way.")}
                </p>
              </div>
              <Switch
                checked={settings.hazardVoiceEnabled}
                onCheckedChange={(v) => updateSetting('hazardVoiceEnabled', v)}
              />
            </div>
          </div>

          {exp.hasCar && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between gap-3">
              <div className="pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <MonitorSmartphone className="w-4 h-4 text-accent" />
                  <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Car Display")}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tr("Oversized, low-clutter Active Ride layout for wired Android screen mirroring (USB/HDMI head units). Kicks in automatically in landscape. Bluetooth-only units and iPhone can't mirror.")}
                </p>
              </div>
              <Switch
                checked={settings.carDisplayEnabled}
                onCheckedChange={(v) => updateSetting('carDisplayEnabled', v)}
              />
            </div>
          </div>
          )}

          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between gap-3">
              <div className="pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <Radio className="w-4 h-4 text-accent" />
                  <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Blacktop Radio")}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tr("Build stations from the music already on your device and switch between them on a GTA-style dial during a ride. Files stay on your phone — nothing is uploaded.")}
                </p>
              </div>
              <Switch
                checked={settings.radioEnabled}
                onCheckedChange={(v) => {
                  updateSetting('radioEnabled', v);
                  if (v) setShowStations(true);
                }}
              />
            </div>
            {settings.radioEnabled && (
              <button
                type="button"
                onClick={() => setShowStations(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-accent/60 text-accent text-xs font-semibold"
              >
                <Radio className="w-3.5 h-3.5" />
                {radioStations.length ? tr("Manage stations ({0})", [radioStations.length]) : tr("Create your first station")}
              </button>
            )}
          </div>
        </CollapsibleSection>


        {/* Discord Integration */}
        <CollapsibleSection icon={MessageSquare} label={tr("Discord")} index={5} delayClass="delay-200">
          <DiscordSettingsCard />
        </CollapsibleSection>

        {/* Accent Color Section */}
        <CollapsibleSection icon={Palette} label={tr("Accent Color")} index={6} delayClass="delay-200">
          <AccentColorPicker 
            selected={settings.accentColor} 
            secondary={settings.secondaryAccentColor}
            onChange={(main, secondary) => updateSettings({ accentColor: main, secondaryAccentColor: secondary })}
          />
        </CollapsibleSection>

        {/* Privacy Section */}
        <CollapsibleSection icon={Shield} label={tr("Privacy")} index={7} delayClass="delay-250">
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>{tr("• Ride history stored locally on device")}</li>
            <li>{tr("• No background tracking unless ride is active")}</li>
            <li>{tr("• Voice is encrypted and never stored on a server; it's only in overlay videos of riders who opt in")}</li>
            {settings.blacktopWorldEnabled && <li>{tr("• Blacktop World shows you as an anonymous glow (to about 110 km) while you ride, and crew boards see totals you publish")}</li>}
            <li>{tr("• Live convoy data is server-burned the moment a ride ends")}</li>
          </ul>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/privacy')}
              className="h-9 text-xs rounded-lg touch-target"
            >
              {tr("Privacy Policy")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/terms')}
              className="h-9 text-xs rounded-lg touch-target"
            >
              {tr("Terms & Safety")}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-3">
            {tr("Battery use increases while a ride is active.")}
          </p>
        </CollapsibleSection>

        


        </div>

        {/* Notifications — full width, dropdown */}
        <NotificationsSection />

        {/* Blacktop World Opt-In — full width, dropdown */}
        <BlacktopWorldOptIn
          enabled={settings.blacktopWorldEnabled}
          onToggle={(v) => updateSetting('blacktopWorldEnabled', v)}
        />

        {/* Burn Button — always-open card in fixed burn colours, whatever the accent */}
        <section className="rounded-[18px] p-4 landscape:p-3 border border-[hsl(var(--burn))]/35 bg-[hsl(var(--burn))]/[0.06] backdrop-blur-xl animate-slide-up delay-300">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-[18px] h-[18px] text-[hsl(var(--burn))]" strokeWidth={1.9} />
            <p className="text-[14px] font-semibold text-[hsl(var(--burn))]">{tr("Burn Button")}</p>
          </div>
          <p className="text-[13px] text-muted-foreground mb-3">
            {demoEnabled ? (
              <>{tr("You're in the demo account. Burning it takes you back to your own account; nothing of yours is deleted.")}</>
            ) : (
              <>
                {tr("Permanently deletes your name and all ride data (")}{stats.totalRides} {stats.totalRides === 1 ? 'ride' : 'rides'},{' '}
                {stats.totalDistance.toFixed(1)}{" "}{tr("mi) and returns you to the welcome screen.")}
              </>
            )}
          </p>
          <Button
            onClick={handleBurn}
            disabled={burning}
            variant={burnStep === 1 ? 'destructive' : 'ghost'}
            className={cn(
              'w-full h-11 font-semibold touch-target rounded-xl transition-all',
              burnStep === 0 &&
                'border border-[hsl(var(--burn))] text-[hsl(var(--burn))] hover:bg-[hsl(var(--burn))] hover:text-background',
              burnStep === 1 && 'animate-burn-pulse'
            )}
          >
            <Flame className="w-4 h-4 mr-2" />
            {demoEnabled ? (burnStep === 0 ? tr("BURN DEMO") : tr("CONFIRM: BACK TO MY ACCOUNT")) : burnStep === 0 ? tr("BURN ALL DATA") : tr("CONFIRM BURN")}
          </Button>
          {burnStep === 1 && (
            <Button onClick={() => setBurnStep(0)} variant="ghost" className="w-full mt-2 touch-target">
              {tr("Cancel")}
            </Button>
          )}
          {!demoEnabled && <p className="text-[11px] text-destructive text-center mt-3">{tr("This action cannot be undone")}</p>}
        </section>

        {/* Tip Jar Section — Nimiq Pay, full card below Burn */}
        <NimiqTipCard />

        {/* Demo account: every rider's Speedshop survey answers */}
        {demoEnabled && <SurveyResultsTable />}

        {/* Legal Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center px-4 pb-4">
          {tr("Blacktop is a ride logging tool, not a racing or enforcement-avoidance app.")}
        </p>
      </div>

      {showStations && <StationManager onClose={() => setShowStations(false)} />}

      <LanguagePicker open={languageOpen} onOpenChange={setLanguageOpen} />

      <BurnFlameOverlay
        active={burning}
        origin={burnOrigin}
        onPeak={handleBurnPeak}
        onComplete={handleBurnComplete}
        // A real burn reloads the app under full cover (BurnReveal finishes the flames).
        holdAtPeak={burnKind === 'real'}
      />

    </div>
  );
}

function NotificationsSection() {
  const push = usePush();
  return (
    <CollapsibleSection icon={Bell} label={tr("Notifications")} delayClass="delay-300" status={push.enabled ? 'On' : ''}>
      <NotificationSettings />
    </CollapsibleSection>
  );
}

function BlacktopWorldOptIn({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <CollapsibleSection
      icon={Globe2}
      label={tr("Blacktop World")}
      delayClass="delay-300"
      status={enabled ? 'On' : ''}
    >
      <div className="space-y-3 text-[13px] text-muted-foreground leading-relaxed">
        <p>
          {tr("The crew hub: a globe with crew convoys, leaderboards, weekly challenges, the arcade, Blacktank (a shared crew fuel fund) and trading-card drops on the map.")}
        </p>
        <p>
          <span className="text-foreground font-medium">{tr("How to open it.")}</span>{" "}{tr("Once it's on, press and hold the spinning globe on the Home screen.")}
        </p>
        <p>
          <span className="text-foreground font-medium">{tr("What it shares.")}</span>{" "}{tr("While you ride, your position is saved to our server so you can appear on the globe. Other riders only ever see an anonymous glow rounded to about 110 km, never your exact position or name. It's deleted when your ride ends. Crew boards see the totals you publish, and card drops you plant are visible to the riders you choose.")}
        </p>
        <Button
          onClick={() => onToggle(!enabled)}
          variant={enabled ? 'outline' : 'default'}
          className={cn('w-full h-11 font-semibold rounded-xl touch-target', !enabled && 'bg-accent hover:bg-accent/90 text-accent-foreground')}
        >
          <Globe2 className="w-4 h-4 mr-2" />
          {enabled ? tr("Turn off Blacktop World") : tr("Turn on Blacktop World")}
        </Button>
      </div>
    </CollapsibleSection>
  );
}

function SegmentedChoice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; icon: React.ElementType }[];
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-secondary/50 border border-border/30">
      {options.map(({ id, label, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={cn(
              'pressable flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium',
              active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
