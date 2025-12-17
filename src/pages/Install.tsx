import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Share, Plus, Check, ChevronLeft, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
    
    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Listen for the install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Check if app was just installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isStandalone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-accent" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Already Installed</h1>
          <p className="text-muted-foreground mb-8">
            Blacktop is running as an installed app.
          </p>
          <Button onClick={() => navigate('/')} className="w-full max-w-xs">
            Open App
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate(-1)}
          className="rounded-full"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold">Install Blacktop</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        {/* App Icon */}
        <div className="mb-8 animate-fade-in">
          <img 
            src="/pwa-512x512.png" 
            alt="Blacktop" 
            className="w-24 h-24 rounded-2xl shadow-lg"
          />
        </div>

        {/* Title */}
        <div className="text-center mb-8 animate-slide-up">
          <h2 className="text-2xl font-bold mb-2">Install Blacktop</h2>
          <p className="text-muted-foreground">
            Add to your home screen for the best experience
          </p>
        </div>

        {/* Benefits */}
        <Card className="w-full mb-8 animate-slide-up delay-100">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="font-medium">Works Offline</p>
                <p className="text-sm text-muted-foreground">Access your ride history anytime</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Download className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="font-medium">Quick Launch</p>
                <p className="text-sm text-muted-foreground">Open directly from your home screen</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Install Actions */}
        <div className="w-full space-y-4 animate-slide-up delay-200">
          {isInstalled ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-accent" />
              </div>
              <p className="text-lg font-medium mb-4">Successfully Installed!</p>
              <Button onClick={() => navigate('/')} className="w-full">
                Open App
              </Button>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full h-14 text-lg">
              <Download className="w-5 h-5 mr-2" />
              Install App
            </Button>
          ) : isIOS ? (
            <Card className="bg-secondary/50">
              <CardContent className="p-4">
                <p className="font-medium mb-3 text-center">Install on iOS</p>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center text-accent font-medium text-xs">1</span>
                    <span>Tap the <Share className="w-4 h-4 inline mx-1" /> Share button</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center text-accent font-medium text-xs">2</span>
                    <span>Scroll and tap "Add to Home Screen"</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center text-accent font-medium text-xs">3</span>
                    <span>Tap <Plus className="w-4 h-4 inline mx-1" /> Add</span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-secondary/50">
              <CardContent className="p-4">
                <p className="font-medium mb-3 text-center">Install on Android</p>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center text-accent font-medium text-xs">1</span>
                    <span>Tap the menu icon (⋮) in your browser</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center text-accent font-medium text-xs">2</span>
                    <span>Tap "Install app" or "Add to Home screen"</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center text-accent font-medium text-xs">3</span>
                    <span>Confirm the installation</span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          )}

          <Button 
            variant="ghost" 
            onClick={() => navigate('/')}
            className="w-full"
          >
            Continue in Browser
          </Button>
        </div>
      </div>
    </div>
  );
}
