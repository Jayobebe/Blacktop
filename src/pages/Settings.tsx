import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '@/features/profile';
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
import { ArrowLeft, Flame, Navigation, Shield, ExternalLink, Eye, Gauge, Pencil, Heart, Palette, AlertTriangle, Video, CloudRain, RefreshCw, CheckCircle2, MessageSquare, ChevronDown, Globe2, Play, MonitorSmartphone, Radio } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { checkForAppUpdate, applyAppUpdate, onUpdateAvailable } from '@/pwa';
import { formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { NavigationApp } from '@/types/blacktop';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DiscordSettingsCard } from '@/features/integrations/discord';
import { openBlacktopMap } from '@/features/map';
import { useGarage } from '@/features/garage';
import { BurnFlameOverlay } from '@/components/BurnFlameOverlay';
import { CollapsibleSection } from '@/features/settings/components/CollapsibleSection';
import { useDemoMode, setDemoMode } from '@/lib/demoMode';
import { StationManager, useRadioStations } from '@/features/radio';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, updateName, resetIdentity } = useProfile();
  const { preferredNavApp, updateNavApp } = useNavigation();
  const { burnAllData, stats } = useRideHistory();
  const { burnGarage } = useGarage();
  const { settings, toggleSpeedUnit, toggleDistanceUnit, setAccentColor, updateSetting, toggleLeanAngle, setLeanAngleThreshold } = useSettings();
  const { stations: radioStations } = useRadioStations();
  const [showStations, setShowStations] = useState(false);
  const [burnStep, setBurnStep] = useState(0);
  const [burning, setBurning] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(profile.name);
  const [isTipping, setIsTipping] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'applying'>('idle');
  const { enabled: demoEnabled } = useDemoMode();
  const [demoActionRevealed, setDemoActionRevealed] = useState(false);
  const [demoHoldProgress, setDemoHoldProgress] = useState(0);
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
    toast.success(next ? 'Demo data injected.' : 'Personal stats restored.');
    setDemoActionRevealed(false);
  };

  useEffect(() => () => cancelDemoHold(), []);

  useEffect(() => {
    const off = onUpdateAvailable((available) => {
      if (available) setUpdateState('available');
    });
    return () => { off(); };
  }, []);

  const handleCheckUpdate = async () => {
    if (updateState === 'available') {
      setUpdateState('applying');
      try {
        await applyAppUpdate();
      } catch {
        toast.error('Could not apply update. Try again.');
        setUpdateState('available');
      }
      return;
    }
    setUpdateState('checking');
    try {
      const found = await checkForAppUpdate();
      if (found) {
        setUpdateState('available');
      } else {
        setUpdateState('up-to-date');
        setTimeout(() => setUpdateState('idle'), 2500);
      }
    } catch {
      toast.error('Could not check for updates.');
      setUpdateState('idle');
    }
  };

  useEffect(() => {
    const tipStatus = searchParams.get('tip');
    if (tipStatus === 'success') {
      toast.success('Thank you for your support!');
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
    { id: 'google', label: 'Google Maps' },
    { id: 'waze', label: 'Waze' },
    { id: 'apple', label: 'Apple Maps' },
    { id: 'blacktop', label: 'Blacktop Maps' },
  ];

  const handleTip = async (amount: 5 | 10 | 20 = 5) => {
    setIsTipping(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-tip', { body: { amount } });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error creating tip session:', error);
      toast.error('Failed to open tip jar. Please try again.');
    } finally {
      setIsTipping(false);
    }
  };

  const [burnOrigin, setBurnOrigin] = useState<{ x: number; y: number } | null>(null);
  // Belt-and-suspenders against a same-tick double-fire (e.g. a script
  // dispatching multiple click events before React re-renders the `disabled`
  // prop) - `burning` state alone can't catch that since it only takes
  // effect after the next render.
  const burnLockRef = useRef(false);

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
      setBurning(true);

      if (demoEnabled) {
        // In demo mode the burn is a "revert to personal stats" gesture —
        // do NOT touch real ride/garage data or the auth identity.
        return;
      }
      try {
        // Together these two cover every input a Ride History receipt is
        // built from (ride stats/badges/G-data + bike name/photo) - receipts
        // aren't stored separately, so this also wipes the receipt bank.
        burnAllData();
        burnGarage();
      } catch (err) {
        console.error('Burn failed:', err);
      }
    }
  };

  const handleBurnPeak = async () => {
    // Screen is fully covered by flame/smoke — safe to swap routes underneath.
    if (demoEnabled) {
      // Drop demo overrides; user lands back on Settings with real data.
      setDemoMode(false);
      setBurnStep(0);
      burnLockRef.current = false;
      toast.success('Personal stats restored.');
      return;
    }
    try {
      await resetIdentity();
    } catch (e) {
      console.error('Identity reset failed:', e);
    }
    navigate('/', { replace: true });
  };

  const handleBurnComplete = () => {
    setBurning(false);
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
      <header className="flex items-center gap-4 mb-4 landscape:mb-3 flex-shrink-0 animate-fade-in">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 landscape:p-2 rounded-xl bg-card/50 border border-border/30 hover:bg-secondary transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl landscape:text-xl font-semibold tracking-tight">Settings</h1>
        </div>
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); startDemoHold(); }}
          onPointerUp={cancelDemoHold}
          onPointerLeave={cancelDemoHold}
          onPointerCancel={cancelDemoHold}
          onContextMenu={(e) => e.preventDefault()}
          className="relative rounded-lg touch-target select-none"
          aria-label="Hold to reveal demo data toggle"
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
      </header>

      {/* Demo data toggle — only visible after a 3s long-press on the BT logo */}
      {demoActionRevealed && (
        <div className="mb-3 landscape:mb-2 flex-shrink-0 animate-slide-up">
          <button
            onClick={handleToggleDemoMode}
            className="w-full px-4 py-3 rounded-2xl bg-accent/10 border border-accent/40 text-accent text-sm font-semibold tracking-wide hover:bg-accent/20 transition-colors"
          >
            {demoEnabled ? 'Revert to personal stats' : 'Inject demo data'}
          </button>
        </div>
      )}


      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3 landscape:space-y-2">
        {/* Profile Section */}
        <section className="bg-card/50 rounded-2xl border border-border/30 animate-slide-up h-14 landscape:h-12 flex items-center px-4 landscape:px-3">
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
                placeholder="Enter your name"
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
              <div className="flex flex-col min-w-0 justify-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none mb-0.5">Profile Name</span>
                <span className="text-sm font-semibold truncate">{profile.name}</span>
              </div>
              <Pencil className="w-4 h-4 text-accent transition-colors shrink-0 ml-2" />
            </button>
         )}
        </section>

        {/* Settings grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Demo */}
          <CollapsibleSection
            icon={Play}
            label="Demo"
            delayClass="delay-75"
            rightElement={<Play className="w-4 h-4 text-accent" />}
            onHeaderClick={() => navigate('/demo')}
          />

          {/* Safety */}
        <CollapsibleSection icon={AlertTriangle} label="Safety" delayClass="delay-100">
          <div className="space-y-5">
            {/* Speed Alerts */}
            <div>
              <p className="text-xs text-muted-foreground mb-3">Speed Alerts</p>
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
                          <p className="text-sm font-medium text-warning">Amber Warning</p>
                          <p className="text-[10px] text-muted-foreground">Display turns amber</p>
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
                          <p className="text-sm font-medium text-destructive">Red Alert</p>
                          <p className="text-[10px] text-muted-foreground">Display turns red</p>
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

            {/* Auto Rescue */}
            <div className="border-t border-border/30 pt-4">
              <p className="text-xs text-muted-foreground mb-3">Auto Rescue</p>
              <div className="flex items-center justify-between mb-2">
                <div className="pr-3">
                  <p className="text-sm font-medium">Crash detection</p>
                  <p className="text-[10px] text-muted-foreground">
                    If a hard impact is followed by a stop, the app asks "Are you okay?". No reply in 5 min → rescue ping fires to convoy leader and Discord (if connected). Works on solo rides too (Discord only).
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
                            toast.error('Motion sensor permission denied');
                            return;
                          }
                        } catch {
                          toast.error('Could not enable motion sensor');
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
                      <p className="text-sm font-medium">Impact sensitivity</p>
                      <span className="font-mono text-sm font-bold text-accent">
                        {settings.autoRescueGThreshold} G
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
                      <span>{AUTO_RESCUE_MIN_G_THRESHOLD} G (sensitive)</span>
                      <span>{AUTO_RESCUE_MAX_G_THRESHOLD} G (only crashes)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">Stop window after impact</p>
                      <span className="font-mono text-sm font-bold text-accent">
                        {settings.autoRescueStopWindowSec}s
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
                      <span>{AUTO_RESCUE_MIN_STOP_WINDOW_SEC}s</span>
                      <span>{AUTO_RESCUE_MAX_STOP_WINDOW_SEC}s</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Acknowledge timeout: <span className="font-mono">5:00</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

         {/* Ride Metrics Section */}
         <CollapsibleSection icon={Gauge} label="Ride Metrics" delayClass="delay-200">
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm font-medium">Speed</p>
                 <p className="text-[10px] text-muted-foreground">Currently {getSpeedLabel(settings.speedUnit)}</p>
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
                 <p className="text-sm font-medium">Distance</p>
                 <p className="text-[10px] text-muted-foreground">Currently {getDistanceLabel(settings.distanceUnit)}</p>
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
                <p className="text-sm font-medium">Enable G-Force Gauge</p>
                <p className="text-[10px] text-muted-foreground">Live G-force gauge and max-G tracking during rides</p>
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
                          toast.error('Motion sensor permission denied');
                          return;
                        }
                      } catch {
                        toast.error('Could not enable motion sensor');
                        return;
                      }
                    }
                  }
                  updateSetting('gForceEnabled', v);
                }}
              />
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
              <div>
                <p className="text-sm font-medium">Enable Lean Angle</p>
                <p className="text-[10px] text-muted-foreground">Track vehicle lean angle in real-time</p>
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
                    <p className="text-sm font-medium text-destructive">Warning Threshold</p>
                    <p className="text-[10px] text-muted-foreground">Arc glows red above this angle</p>
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

           <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
             <div>
               <p className="text-sm font-medium">3D Ride Flyover</p>
               <p className="text-[10px] text-muted-foreground">3D route overview button in ride history</p>
             </div>
             <Switch
               checked={settings.flyoverEnabled}
               onCheckedChange={() => updateSetting('flyoverEnabled', !settings.flyoverEnabled)}
             />
           </div>
           <div className="flex items-center justify-between mt-4">
             <div>
               <p className="text-sm font-medium">Ride Overlay</p>
               <p className="text-[10px] text-muted-foreground">Recorded overlay download in ride history</p>
             </div>
             <Switch
               checked={settings.rideOverlayEnabled}
               onCheckedChange={() => updateSetting('rideOverlayEnabled', !settings.rideOverlayEnabled)}
             />
           </div>
           {settings.rideOverlayEnabled && (
             <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
               <div>
                 <p className="text-sm font-medium">Voice Channel Recording</p>
                 <p className="text-[10px] text-muted-foreground">Add convoy voice audio to the recorded overlay</p>
               </div>
               <Switch
                 checked={settings.voiceRecordingEnabled}
                 onCheckedChange={() => updateSetting('voiceRecordingEnabled', !settings.voiceRecordingEnabled)}
               />
             </div>
           )}
         </CollapsibleSection>


        {/* Navigation App Section */}
        <CollapsibleSection icon={Navigation} label="Navigation" delayClass="delay-200">
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
                    title={app.id === 'blacktop' ? 'Preview Blacktop Maps' : `Open ${app.label}`}
                  >
                    {app.id === 'blacktop' ? <Eye className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Blacktop opens your preferred app for directions
          </p>

          {preferredNavApp === 'blacktop' && (
            <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Video className="w-4 h-4 text-accent" />
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Traffic Cameras</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Show speed cameras &amp; ANPR poles on the map when zoomed in. Crowd-sourced from OpenStreetMap — informational only, coverage varies by area.
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
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Weather Overlay</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Animated rain radar on the Blacktop map, powered by RainViewer.
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
                    <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Weather Routing</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Warns when heavy rain sits on your route and offers a drier line.
                  </p>
                </div>
                <Switch
                  checked={settings.weatherRoutingEnabled}
                  onCheckedChange={(v) => updateSetting('weatherRoutingEnabled', v)}
                />
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between gap-3">
              <div className="pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <MonitorSmartphone className="w-4 h-4 text-accent" />
                  <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Car Display</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Oversized, low-clutter Active Ride layout for wired Android screen mirroring (USB/HDMI head units). Kicks in automatically in landscape. Bluetooth-only units and iPhone can't mirror.
                </p>
              </div>
              <Switch
                checked={settings.carDisplayEnabled}
                onCheckedChange={(v) => updateSetting('carDisplayEnabled', v)}
              />
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between gap-3">
              <div className="pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <Radio className="w-4 h-4 text-accent" />
                  <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Blacktop Radio</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Build stations from the music already on your device and switch between them on a GTA-style dial during a ride. Files stay on your phone — nothing is uploaded.
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
                {radioStations.length ? `Manage stations (${radioStations.length})` : 'Create your first station'}
              </button>
            )}
          </div>
        </CollapsibleSection>


        {/* Discord Integration */}
        <CollapsibleSection icon={MessageSquare} label="Discord" delayClass="delay-200">
          <DiscordSettingsCard />
        </CollapsibleSection>

        {/* Accent Color Section */}
        <CollapsibleSection icon={Palette} label="Accent Color" delayClass="delay-200">
          <AccentColorPicker 
            selected={settings.accentColor} 
            onSelect={setAccentColor} 
          />
        </CollapsibleSection>

        {/* Privacy Section */}
        <CollapsibleSection icon={Shield} label="Privacy" delayClass="delay-250" className="landscape:hidden">
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• All ride data stored locally on device</li>
            <li>• No background tracking unless ride is active</li>
            <li>• Voice data is never recorded or stored</li>
            <li>• Live convoy data is server-burned the moment a ride ends</li>
          </ul>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/privacy')}
              className="h-9 text-xs rounded-lg touch-target"
            >
              Privacy Policy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/terms')}
              className="h-9 text-xs rounded-lg touch-target"
            >
              Terms & Safety
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-3">
            Battery use increases while a ride is active.
          </p>
        </CollapsibleSection>

        {/* App Updates Section */}
        <CollapsibleSection icon={RefreshCw} label="App Updates" delayClass="delay-300">
          <p className="text-xs text-muted-foreground mb-3">
            Pull the latest version without reinstalling. Your rides, garage and settings stay safe — only the app shell is refreshed.
          </p>
          <Button
            onClick={handleCheckUpdate}
            disabled={updateState === 'checking' || updateState === 'applying'}
            variant={updateState === 'available' ? 'default' : 'outline'}
            className={cn(
              "w-full h-11 font-semibold touch-target rounded-xl",
              updateState === 'available' && "bg-accent hover:bg-accent/90 text-accent-foreground"
            )}
          >
            {updateState === 'checking' && (<><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Checking…</>)}
            {updateState === 'applying' && (<><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Updating…</>)}
            {updateState === 'available' && (<><RefreshCw className="w-4 h-4 mr-2" />Update available — tap to install</>)}
            {updateState === 'up-to-date' && (<><CheckCircle2 className="w-4 h-4 mr-2" />You're up to date</>)}
            {updateState === 'idle' && (<><RefreshCw className="w-4 h-4 mr-2" />Check for updates</>)}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Tip: keep the installed app — your stats live on your device.
          </p>
        </CollapsibleSection>
        </div>


        {/* Blacktop World Opt-In */}
        <BlacktopWorldOptIn
          enabled={settings.blacktopWorldEnabled}
          onToggle={(v) => updateSetting('blacktopWorldEnabled', v)}
        />


        {/* Burn Button Section */}
        <section className="bg-[hsl(var(--burn))]/5 rounded-2xl p-4 landscape:p-3 border border-[hsl(var(--burn))]/30 animate-slide-up delay-300">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-[hsl(var(--burn))]" />
            <p className="text-[10px] text-[hsl(var(--burn))] uppercase tracking-widest font-semibold">Burn Button</p>
          </div>
          
          <p className="text-xs text-muted-foreground mb-3">
            Permanently delete your name and all ride data ({stats.totalRides} rides, {stats.totalDistance.toFixed(1)} mi). Returns you to the welcome screen.
          </p>

          <Button
            onClick={handleBurn}
            disabled={burning}
            variant={burnStep === 1 ? "destructive" : "outline"}
            className={cn(
              "w-full h-11 font-semibold touch-target rounded-xl transition-all",
              burnStep === 0 && "border-[hsl(var(--burn))] text-[hsl(var(--burn))] hover:bg-[hsl(var(--burn))] hover:text-background",
              burnStep === 1 && "animate-burn-pulse"
            )}
          >
            <Flame className="w-4 h-4 mr-2" />
            {burnStep === 0 ? "BURN ALL DATA" : "CONFIRM BURN"}
          </Button>

          {burnStep === 1 && (
            <Button
              onClick={() => setBurnStep(0)}
              variant="ghost"
              className="w-full mt-2 touch-target"
            >
              Cancel
            </Button>
          )}

          <p className="text-[10px] text-destructive text-center mt-3">
            This action cannot be undone
          </p>
        </section>


        {/* Tip Jar Section */}
        <section className="bg-accent/5 rounded-2xl p-4 landscape:p-3 border border-accent/30 animate-slide-up delay-300">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-accent" />
            <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Enjoying Blacktop?</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Help keep us ad-free!
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => handleTip(5)}
              disabled={isTipping}
              className="flex-1 h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-xl touch-target"
            >
              <Heart className="w-4 h-4 mr-2" />
              {isTipping ? 'Opening...' : 'Donate $5'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={isTipping}
                  aria-label="Choose a different tip amount"
                  className="h-11 w-11 px-0 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl touch-target"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border/30">
                <DropdownMenuItem onClick={() => handleTip(10)} disabled={isTipping}>
                  Donate $10
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleTip(20)} disabled={isTipping}>
                  Donate $20
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        {/* Legal Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center px-4 pb-4">
          Blacktop is a ride logging tool, not a racing or enforcement-avoidance app.
        </p>
      </div>

      {showStations && <StationManager onClose={() => setShowStations(false)} />}

      <BurnFlameOverlay
        active={burning}
        origin={burnOrigin}
        onPeak={handleBurnPeak}
        onComplete={handleBurnComplete}
      />

    </div>
  );
}

function BlacktopWorldOptIn({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-300">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left"
      >
        <Globe2 className="w-4 h-4 text-accent" />
        <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">Blacktop World</p>
        <ChevronDown
          className={cn(
            'w-4 h-4 ml-auto text-muted-foreground transition-transform duration-300',
            open && 'rotate-180',
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            The crew hub — a spinning globe with landmarks for{' '}
            <span className="text-foreground font-medium">crew convoys</span>,{' '}
            <span className="text-foreground font-medium">crew leaderboards</span>,{' '}
            <span className="text-foreground font-medium">crew QR joining</span>, your card
            collection and the arcade, with an anonymous country-level glow showing where riders
            are active. When opted in, you can also <span className="text-foreground font-medium">long-press
            the spinning globe</span> on the home screen to launch it.
          </p>

          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Opting in also unlocks the <span className="text-foreground font-medium">card
            collection folder</span> inside Blacktop World and the{' '}
            <span className="text-foreground font-medium">flip-to-QR</span> button on
            your own vehicle cards in Stats — so other riders can scan your card
            and you can scan theirs to build a shared collection. Cards stay on
            each device; no rider data leaves your phone unless you show
            someone your QR.
          </p>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            <span className="text-foreground font-medium">Card drops</span> are a Blacktop World
            feature only — planting, finding and collecting cards on the map is
            active solely while you're opted in. Opt out and drops stop being
            listed, planted or collected.
          </p>
          <p className="text-[10px] text-muted-foreground mb-3">
            Opting in shares only your <span className="text-foreground">country</span> (derived
            from your coarse location) while the app is open — never your exact
            position, name, or ride data. Opt out any time; long-press, the
            card folder, card drops, and the flip button all stop working immediately.
          </p>

          {enabled ? (
            <Button
              onClick={() => onToggle(false)}
              variant="outline"
              className="w-full h-11 font-semibold rounded-xl touch-target border-border/50 mt-3"
            >
              <Globe2 className="w-4 h-4 mr-2" />
              Opt out of Blacktop World
            </Button>
          ) : (
            <Button
              onClick={() => onToggle(true)}
              className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-xl touch-target mt-3"
            >
              <Globe2 className="w-4 h-4 mr-2" />
              Opt in to Blacktop World
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

