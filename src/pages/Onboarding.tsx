import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Download } from 'lucide-react';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const { createProfile } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createProfile(name.trim());
      navigate('/');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col landscape:flex-row items-center justify-center p-4 landscape:p-3 safe-top safe-bottom gap-6 landscape:gap-8">
      {/* Branding - left side in landscape */}
      <div className="text-center landscape:text-left landscape:flex-1 landscape:max-w-xs">
        <h1 className="text-5xl landscape:text-4xl font-semibold tracking-tight mb-3">
          BLACKTOP
        </h1>
        <p className="text-muted-foreground text-sm mb-4">
          Ride logging & convoy communication
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs text-accent font-medium">No account required</span>
        </div>
      </div>

      {/* Form - right side in landscape */}
      <div className="w-full max-w-sm landscape:flex-1 landscape:max-w-xs">

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              Profile Name
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="h-14 text-lg"
              maxLength={20}
              autoFocus
              disabled={isCreating}
            />
          </div>

          <Button
            type="submit"
            disabled={!name.trim() || isCreating}
            className="w-full h-14 text-base font-semibold rounded-2xl touch-target"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              'Get Started'
            )}
          </Button>
        </form>

        <div className="text-center mt-4 landscape:mt-2 px-4 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your data stays on your device. No cloud sync, no tracking, no ads.
          </p>
          <p className="text-[10px] text-muted-foreground/60 landscape:hidden">
            Blacktop is a ride logging tool, not a racing app.
          </p>
        </div>

        {/* Install prompt - only shown in browser mode, hidden in landscape */}
        {!isStandalone && (
          <div className="mt-4 pt-4 border-t border-border/50 landscape:hidden">
            <Button
              variant="outline"
              onClick={() => navigate('/install')}
              className="w-full h-10 text-sm gap-2"
            >
              <Download className="w-4 h-4" />
              Install App
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
