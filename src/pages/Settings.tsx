import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useNavigation } from '@/hooks/useNavigation';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { AccentColorPicker } from '@/components/AccentColorPicker';
import { BTLogo } from '@/components/BTLogo';
import { ArrowLeft, Flame, Navigation, Shield, ExternalLink, Users, Gauge, Pencil, Heart, Palette, AlertTriangle } from 'lucide-react';
import { NavigationApp } from '@/types/blacktop';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, updateName, resetIdentity } = useProfile();
  const { preferredNavApp, updateNavApp } = useNavigation();
  const { burnAllData, stats } = useRideHistory();
  const { settings, toggleSpeedRankings, toggleSpeedUnit, toggleDistanceUnit, setAccentColor, updateSetting } = useSettings();
  const [burnStep, setBurnStep] = useState(0);
  const [resetStep, setResetStep] = useState(0);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(profile.name);
  const [isTipping, setIsTipping] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

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

  const handleResetIdentity = async () => {
    if (resetStep === 0) {
      setResetStep(1);
      return;
    }

    if (resetStep === 1) {
      await resetIdentity();
      toast.success('Identity reset — welcome back.');
      setResetStep(2);
      setTimeout(() => setResetStep(0), 2500);
    }
  };

  const handleBurn = () => {
    if (burnStep === 0) {
      setBurnStep(1);
    } else if (burnStep === 1) {
      burnAllData();
      setBurnStep(2);
      setTimeout(() => setBurnStep(0), 3000);
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-4 landscape:mb-2 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 landscape:p-2 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <h1 className="text-xl landscape:text-lg font-display font-bold flex-1">Settings</h1>
        <BTLogo size="md" />
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4 landscape:space-y-3 animate-fade-in">
        {/* Profile Section */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Profile
          </h2>
          {isEditingName ? (
            <Input
              ref={nameInputRef}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleNameKeyDown}
              maxLength={20}
              className="text-base font-medium h-10"
              placeholder="Enter your name"
            />
          ) : (
            <button
              onClick={() => {
                setEditedName(profile.name);
                setIsEditingName(true);
              }}
              className="flex items-center gap-2 text-base font-medium hover:text-accent transition-colors group w-full text-left"
            >
              {profile.name}
              <Pencil className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
           )}

          <div className="mt-3">
            {resetStep === 2 ? (
              <p className="text-sm text-accent text-center py-1.5">Reset complete</p>
            ) : (
              <Button
                onClick={handleResetIdentity}
                variant={resetStep === 1 ? 'destructive' : 'outline'}
                size="sm"
                className="w-full touch-target"
              >
                {resetStep === 0 ? 'Reset identity' : 'Confirm reset'}
              </Button>
            )}

            {resetStep === 1 && (
              <Button
                onClick={() => setResetStep(0)}
                variant="ghost"
                size="sm"
                className="w-full mt-1.5 touch-target"
              >
                Cancel
              </Button>
            )}

            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              Use this if an uninstall/reinstall kept your old name.
            </p>
          </div>
        </section>

        {/* Navigation App Section */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Navigation App
            </h2>
          </div>
          <div className="space-y-1.5">
            {navApps.map((app) => {
              const isSelected = preferredNavApp === app.id;
              
              const handleOpenApp = () => {
                const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
                const isAndroid = /Android/.test(navigator.userAgent);
                
                let appUrl = '';
                let fallbackUrl = '';
                
                if (app.id === 'google') {
                  appUrl = 'https://www.google.com/maps';
                  fallbackUrl = isIOS 
                    ? 'https://apps.apple.com/app/google-maps/id585027354'
                    : isAndroid 
                      ? 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps'
                      : 'https://www.google.com/maps';
                } else if (app.id === 'apple') {
                  appUrl = 'https://maps.apple.com/';
                  fallbackUrl = isIOS 
                    ? 'https://maps.apple.com/'
                    : 'https://www.apple.com/maps/';
                } else if (app.id === 'waze') {
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
                <div
                  key={app.id}
                  className={cn(
                    "w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors",
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border"
                  )}
                >
                  <button
                    onClick={() => updateNavApp(app.id)}
                    className={cn(
                      "flex-1 text-left text-sm touch-target",
                      isSelected ? "text-accent font-medium" : "text-foreground hover:text-accent"
                    )}
                  >
                    {app.label}
                  </button>
                  <button
                    onClick={handleOpenApp}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      isSelected 
                        ? "text-accent hover:bg-accent/20" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    title={`Open ${app.label}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Blacktop will open your preferred navigation app for directions
          </p>
        </section>

        {/* Accent Color Section */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
          <div className="flex items-center gap-2 mb-3 landscape:mb-2">
            <Palette className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Accent Color
            </h2>
          </div>
          <AccentColorPicker 
            selected={settings.accentColor} 
            onSelect={setAccentColor} 
          />
        </section>

        {/* Units Section */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Units
            </h2>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5">
              <div>
                <p className="text-sm font-medium">Speed</p>
                <p className="text-[10px] text-muted-foreground">MPH or KPH</p>
              </div>
              <button
                onClick={toggleSpeedUnit}
                className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors font-mono font-medium text-xs"
              >
                {settings.speedUnit.toUpperCase()}
              </button>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <div>
                <p className="text-sm font-medium">Distance</p>
                <p className="text-[10px] text-muted-foreground">Miles or kilometers</p>
              </div>
              <button
                onClick={toggleDistanceUnit}
                className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors font-mono font-medium text-xs"
              >
                {settings.distanceUnit === 'miles' ? 'MILES' : 'KM'}
              </button>
            </div>
          </div>
        </section>

        {/* Speed Alert Thresholds */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Speed Alerts
            </h2>
          </div>
          <div className="space-y-4">
            {/* Amber threshold */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-warning">Amber Warning</p>
                  <p className="text-[10px] text-muted-foreground">Speed display turns amber</p>
                </div>
                <span className="font-mono text-sm font-bold text-warning">
                  {settings.amberSpeedThreshold} {settings.speedUnit}
                </span>
              </div>
              <input
                type="range"
                min={settings.speedUnit === 'mph' ? 40 : 60}
                max={settings.speedUnit === 'mph' ? 120 : 200}
                step={5}
                value={settings.amberSpeedThreshold}
                onChange={(e) => {
                  const newAmber = Number(e.target.value);
                  updateSetting('amberSpeedThreshold', newAmber);
                  // Ensure red is always higher than amber
                  if (settings.redSpeedThreshold <= newAmber) {
                    updateSetting('redSpeedThreshold', newAmber + 10);
                  }
                }}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-warning"
              />
            </div>

            {/* Red threshold */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-destructive">Red Alert</p>
                  <p className="text-[10px] text-muted-foreground">Speed display turns red</p>
                </div>
                <span className="font-mono text-sm font-bold text-destructive">
                  {settings.redSpeedThreshold} {settings.speedUnit}
                </span>
              </div>
              <input
                type="range"
                min={settings.speedUnit === 'mph' ? 50 : 80}
                max={settings.speedUnit === 'mph' ? 150 : 250}
                step={5}
                value={settings.redSpeedThreshold}
                onChange={(e) => {
                  const newRed = Number(e.target.value);
                  // Ensure red is always higher than amber
                  if (newRed > settings.amberSpeedThreshold) {
                    updateSetting('redSpeedThreshold', newRed);
                  }
                }}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-destructive"
              />
            </div>
          </div>
        </section>

        {/* Convoy Display Section */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Convoy Display
            </h2>
          </div>
          <div className="flex items-center justify-between py-1">
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

        {/* Privacy Section - hidden in landscape */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-border landscape:hidden">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Privacy & Battery
            </h2>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• All ride data stored locally on device</li>
            <li>• No background tracking unless ride is active</li>
            <li>• Voice data is never recorded or stored</li>
          </ul>
          <p className="text-[10px] text-muted-foreground/70 mt-2 pt-2 border-t border-border/50">
            Battery use increases while a ride is active.
          </p>
        </section>

        {/* Tip Jar Section */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-accent/30">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-3.5 h-3.5 text-accent" />
            <h2 className="text-xs font-semibold text-accent uppercase tracking-wide">
              Enjoying BlackTop?
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Help keep us ad-free!
          </p>
          <Button
            onClick={handleTip}
            disabled={isTipping}
            size="sm"
            className="w-full h-10 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold touch-target"
          >
            <Heart className="w-3.5 h-3.5 mr-2" />
            {isTipping ? 'Opening...' : 'Donate $5'}
          </Button>
        </section>

        {/* Burn Button Section */}
        <section className="bg-card rounded-lg p-3 landscape:p-2.5 border border-destructive/30">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-3.5 h-3.5 text-burn" />
            <h2 className="text-xs font-semibold text-burn uppercase tracking-wide">
              Burn Button
            </h2>
          </div>
          
          <p className="text-xs text-muted-foreground mb-2">
            Permanently delete all ride data ({stats.totalRides} rides, {stats.totalDistance.toFixed(1)} mi).
          </p>

          {burnStep === 2 ? (
            <div className="text-center py-2">
              <p className="text-accent font-medium text-sm">All data burned</p>
            </div>
          ) : (
            <Button
              onClick={handleBurn}
              variant={burnStep === 1 ? "destructive" : "outline"}
              size="sm"
              className={cn(
                "w-full h-10 font-semibold touch-target transition-all",
                burnStep === 0 && "border-burn text-burn hover:bg-burn hover:text-background",
                burnStep === 1 && "animate-burn-pulse"
              )}
            >
              <Flame className="w-4 h-4 mr-2" />
              {burnStep === 0 ? "BURN ALL DATA" : "CONFIRM BURN"}
            </Button>
          )}

          {burnStep === 1 && (
            <Button
              onClick={() => setBurnStep(0)}
              variant="ghost"
              size="sm"
              className="w-full mt-2 touch-target"
            >
              Cancel
            </Button>
          )}

          <p className="text-[10px] text-destructive text-center mt-2">
            This action cannot be undone
          </p>
        </section>

        {/* Legal Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center px-4 pb-2">
          Blacktop is a ride logging tool, not a racing or enforcement-avoidance app.
        </p>
      </div>
    </div>
  );
}
