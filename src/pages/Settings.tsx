import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useNavigation } from '@/hooks/useNavigation';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Flame, Navigation, Shield, ExternalLink, Users, Gauge } from 'lucide-react';
import { NavigationApp } from '@/types/blacktop';
import { cn } from '@/lib/utils';

export default function Settings() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { preferredNavApp, updateNavApp } = useNavigation();
  const { burnAllData, stats } = useRideHistory();
  const { settings, toggleSpeedRankings, toggleSpeedUnit, toggleDistanceUnit } = useSettings();
  const [burnStep, setBurnStep] = useState(0);

  const navApps: { id: NavigationApp; label: string }[] = [
    { id: 'google', label: 'Google Maps' },
    { id: 'waze', label: 'Waze' },
    { id: 'apple', label: 'Apple Maps' },
  ];

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
        <h1 className="text-2xl font-display font-bold">Settings</h1>
      </header>

      <div className="space-y-6 animate-fade-in">
        {/* Profile Section */}
        <section className="bg-card rounded-lg p-4 border border-border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Profile
          </h2>
          <p className="text-lg font-medium">{profile.name}</p>
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
            {navApps.map((app) => (
              <button
                key={app.id}
                onClick={() => updateNavApp(app.id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border transition-colors touch-target",
                  preferredNavApp === app.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:bg-muted"
                )}
              >
                <span className={cn(
                  preferredNavApp === app.id ? "text-accent font-medium" : "text-foreground"
                )}>
                  {app.label}
                </span>
                {preferredNavApp === app.id && (
                  <ExternalLink className="w-4 h-4 text-accent" />
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Blacktop will open your preferred navigation app for directions
          </p>
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
              <p className="text-sm font-medium">Show Speed Rankings</p>
              <p className="text-xs text-muted-foreground">Display speed stats and rankings during rides</p>
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
