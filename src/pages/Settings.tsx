import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '@/features/profile';
import { useNavigation } from '@/hooks/useNavigation';
import { useRideHistory } from '@/features/ride';
import { useSettings, AccentColorPicker } from '@/features/settings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { BTLogo } from '@/components/BTLogo';
import { ArrowLeft, Flame, Navigation, Shield, ExternalLink, Users, Gauge, Pencil, Heart, Palette, AlertTriangle, Video, Activity, RefreshCw, CheckCircle2 } from 'lucide-react';
import { checkForAppUpdate, applyAppUpdate, onUpdateAvailable } from '@/pwa';
import { formatSpeed, getSpeedLabel, getDistanceLabel } from '@/lib/format';
import { NavigationApp } from '@/types/blacktop';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DiscordSettingsCard } from '@/features/integrations/discord';
import { useGarage } from '@/features/garage';
import { BurnFlameOverlay } from '@/components/BurnFlameOverlay';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, updateName, resetIdentity } = useProfile();
  const { preferredNavApp, updateNavApp } = useNavigation();
  const { burnAllData, stats } = useRideHistory();
  const { burnGarage } = useGarage();
  const { settings, toggleSpeedRankings, toggleSpeedUnit, toggleDistanceUnit, setAccentColor, updateSetting, toggleLiveStreaming, generateStreamKey, toggleStatsOverlay, toggleLeanAngle, setLeanAngleThreshold } = useSettings();
  const [burnStep, setBurnStep] = useState(0);
  const [burning, setBurning] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(profile.name);
  const [isTipping, setIsTipping] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'applying'>('idle');

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
  ];

  const handleTip = async () => {
    setIsTipping(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-tip');
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

  const handleBurn = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (burnStep === 0) {
      setBurnStep(1);
    } else if (burnStep === 1) {
      // Capture the button's center as the flame origin
      const rect = e.currentTarget.getBoundingClientRect();
      setBurnOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      setBurning(true);
      try {
        burnAllData();
        burnGarage();
      } catch (err) {
        console.error('Burn failed:', err);
      }
    }
  };

  const handleBurnPeak = async () => {
    // Screen is fully covered by flame/smoke — safe to swap routes underneath.
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
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
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
        <BTLogo size="md" />
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3 landscape:space-y-2">
        {/* Profile Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3">Profile</p>
          {isEditingName ? (
            <Input
              ref={nameInputRef}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleNameKeyDown}
              maxLength={20}
              className="text-lg font-medium h-12 rounded-xl"
              placeholder="Enter your name"
            />
          ) : (
            <button
              onClick={() => {
                setEditedName(profile.name);
                setIsEditingName(true);
              }}
              className="flex items-center gap-3 text-lg font-semibold hover:text-accent transition-colors group w-full text-left"
            >
              {profile.name}
              <Pencil className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
         )}
        </section>

        {/* Navigation App Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-75">
          <div className="flex items-center gap-2 mb-3">
            <Navigation className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Navigation App</p>
          </div>
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
                    onClick={() => handleOpenNavApp(app.id)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      isSelected 
                        ? "text-accent hover:bg-accent/20" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    title={`Open ${app.label}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Blacktop opens your preferred app for directions
          </p>
        </section>

        {/* Discord Integration */}
        <DiscordSettingsCard />


        {/* Accent Color Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-100">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Accent Color</p>
          </div>
          <AccentColorPicker 
            selected={settings.accentColor} 
            onSelect={setAccentColor} 
          />
        </section>

        {/* Units Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-150">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Units</p>
          </div>
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
        </section>

        {/* Speed Alert Thresholds */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Speed Alerts</p>
          </div>
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
        </section>

        {/* Lean Angle Sensor Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-200">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Lean Angle Sensor</p>
          </div>
          <div className="flex items-center justify-between mb-4">
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
            <div className="pt-3 border-t border-border/30">
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
        </section>

        {/* Convoy Display Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-200">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Convoy Display</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Show Convoy Metrics</p>
              <p className="text-[10px] text-muted-foreground">Speed stats during rides</p>
            </div>
            <Switch 
              checked={settings.showSpeedRankings} 
              onCheckedChange={toggleSpeedRankings}
            />
          </div>
        </section>


        {/* Privacy Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-200 landscape:hidden">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Privacy & Battery</p>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• All ride data stored locally on device</li>
            <li>• No background tracking unless ride is active</li>
            <li>• Voice data is never recorded or stored</li>
          </ul>
          <p className="text-[10px] text-muted-foreground/70 mt-3 pt-3 border-t border-border/30">
            Battery use increases while a ride is active.
          </p>
        </section>

        {/* App Updates Section */}
        <section className="bg-card/50 rounded-2xl p-4 landscape:p-3 border border-border/30 animate-slide-up delay-300">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">App Updates</p>
          </div>
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
          <Button
            onClick={handleTip}
            disabled={isTipping}
            className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-xl touch-target"
          >
            <Heart className="w-4 h-4 mr-2" />
            {isTipping ? 'Opening...' : 'Donate $5'}
          </Button>
        </section>

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

        {/* Legal Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center px-4 pb-4">
          Blacktop is a ride logging tool, not a racing or enforcement-avoidance app.
        </p>
      </div>

      <BurnFlameOverlay
        active={burning}
        origin={burnOrigin}
        onPeak={handleBurnPeak}
        onComplete={handleBurnComplete}
      />
    </div>
  );
}
