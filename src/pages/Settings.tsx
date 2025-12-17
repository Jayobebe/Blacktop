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
import { ArrowLeft, Flame, Navigation, Shield, ExternalLink, Users, Gauge, Pencil, Heart, Palette } from 'lucide-react';
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
  const { settings, toggleSpeedRankings, toggleSpeedUnit, toggleDistanceUnit, setAccentColor } = useSettings();
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
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-3 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-display font-bold flex-1">Settings</h1>
        <BTLogo size="md" />
      </header>

      <div className="space-y-6 animate-fade-in">
        {/* Profile Section */}
        <section className="bg-card rounded-lg p-4 border border-border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
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
              className="text-lg font-medium h-12"
              placeholder="Enter your name"
            />
          ) : (
            <button
              onClick={() => {
                setEditedName(profile.name);
                setIsEditingName(true);
              }}
              className="flex items-center gap-2 text-lg font-medium hover:text-accent transition-colors group w-full text-left"
            >
              {profile.name}
              <Pencil className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
           )}

          <div className="mt-4">
            {resetStep === 2 ? (
              <p className="text-sm text-accent text-center py-2">Reset complete</p>
            ) : (
              <Button
                onClick={handleResetIdentity}
                variant={resetStep === 1 ? 'destructive' : 'outline'}
                className="w-full touch-target"
              >
                {resetStep === 0 ? 'Reset identity' : 'Confirm reset'}
              </Button>
            )}

            {resetStep === 1 && (
              <Button
                onClick={() => setResetStep(0)}
                variant="ghost"
                className="w-full mt-2 touch-target"
              >
                Cancel
              </Button>
            )}

            <p className="text-xs text-muted-foreground text-center mt-2">
              Use this if an uninstall/reinstall kept your old name.
            </p>
          </div>
        </section>

        {/* Navigation App Section */}
        <section className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Navigation className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Navigation App
            </h2>
          </div>
          <div className="space-y-2">
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
                
                // Try opening the app via universal link
                const newWindow = window.open(appUrl, '_blank');
                
                // If on mobile and the app might not be installed, set up fallback
                if ((isIOS || isAndroid) && newWindow) {
                  setTimeout(() => {
                    // If we're still here after timeout, app likely didn't open
                    // The universal links should handle this automatically,
                    // but we provide the fallback URL as backup
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
                    "w-full flex items-center justify-between p-3 rounded-lg border transition-colors",
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border"
                  )}
                >
                  <button
                    onClick={() => updateNavApp(app.id)}
                    className={cn(
                      "flex-1 text-left touch-target",
                      isSelected ? "text-accent font-medium" : "text-foreground hover:text-accent"
                    )}
                  >
                    {app.label}
                  </button>
                  <button
                    onClick={handleOpenApp}
                    className={cn(
                      "p-2 rounded-md transition-colors",
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
          <p className="text-xs text-muted-foreground mt-3">
            Blacktop will open your preferred navigation app for directions
          </p>
        </section>

        {/* Accent Color Section */}
        <section className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Accent Color
            </h2>
          </div>
          <AccentColorPicker 
            selected={settings.accentColor} 
            onSelect={setAccentColor} 
          />
        </section>

        {/* Units Section */}
        <section className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Units
            </h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Speed</p>
                <p className="text-xs text-muted-foreground">Display speed in MPH or KPH</p>
              </div>
              <button
                onClick={toggleSpeedUnit}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-muted transition-colors font-mono font-medium text-sm"
              >
                {settings.speedUnit.toUpperCase()}
              </button>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Distance</p>
                <p className="text-xs text-muted-foreground">Display distance in miles or kilometers</p>
              </div>
              <button
                onClick={toggleDistanceUnit}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-muted transition-colors font-mono font-medium text-sm"
              >
                {settings.distanceUnit === 'miles' ? 'MILES' : 'KM'}
              </button>
            </div>
          </div>
        </section>

        {/* Convoy Display Section */}
        <section className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Convoy Display
            </h2>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Show Convoy Metrics</p>
              <p className="text-xs text-muted-foreground">Display speed stats and metrics during rides</p>
            </div>
            <Switch 
              checked={settings.showSpeedRankings} 
              onCheckedChange={toggleSpeedRankings}
            />
          </div>
        </section>

        {/* Privacy Section */}
        <section className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Privacy
            </h2>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• All ride data stored locally on device</li>
            <li>• No background tracking unless ride is active</li>
            <li>• No cloud sync by default</li>
            <li>• Voice data is never recorded or stored</li>
          </ul>
        </section>

        {/* Tip Jar Section */}
        <section className="bg-card rounded-lg p-4 border border-accent/30">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wide">
              Enjoying BlackTop?
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Help keep us ad-free!
          </p>
          <Button
            onClick={handleTip}
            disabled={isTipping}
            className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold touch-target"
          >
            <Heart className="w-4 h-4 mr-2" />
            {isTipping ? 'Opening...' : 'Donate $5'}
          </Button>
        </section>

        {/* Burn Button Section */}
        <section className="bg-card rounded-lg p-4 border border-destructive/30">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-burn" />
            <h2 className="text-sm font-semibold text-burn uppercase tracking-wide">
              Burn Button
            </h2>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Permanently delete all ride data ({stats.totalRides} rides, {stats.totalDistance.toFixed(1)} miles).
            Your profile name will be retained.
          </p>

          {burnStep === 2 ? (
            <div className="text-center py-4">
              <p className="text-accent font-medium">All data burned</p>
            </div>
          ) : (
            <Button
              onClick={handleBurn}
              variant={burnStep === 1 ? "destructive" : "outline"}
              className={cn(
                "w-full h-14 text-lg font-semibold touch-target transition-all",
                burnStep === 0 && "border-burn text-burn hover:bg-burn hover:text-background",
                burnStep === 1 && "animate-burn-pulse"
              )}
            >
              <Flame className="w-5 h-5 mr-2" />
              {burnStep === 0 ? "BURN ALL DATA" : "CONFIRM BURN"}
            </Button>
          )}

          {burnStep === 1 && (
            <Button
              onClick={() => setBurnStep(0)}
              variant="ghost"
              className="w-full mt-3 touch-target"
            >
              Cancel
            </Button>
          )}

          <p className="text-xs text-destructive text-center mt-3">
            This action cannot be undone
          </p>
        </section>

        {/* Legal Disclaimer */}
        <p className="text-xs text-muted-foreground text-center px-4 pb-4">
          Blacktop is a ride logging and communication tool, not a racing or enforcement-avoidance app.
        </p>
      </div>
    </div>
  );
}
