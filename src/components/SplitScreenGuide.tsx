import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Navigation, Smartphone, Monitor, ChevronRight, ExternalLink } from 'lucide-react';

interface SplitScreenGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNav: () => void;
}

export function SplitScreenGuide({ isOpen, onClose, onOpenNav }: SplitScreenGuideProps) {
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);

  const handleOpenNav = () => {
    onClose();
    onOpenNav();
  };

  const resetAndClose = () => {
    setPlatform(null);
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-accent" />
            Use with Navigation App
          </DrawerTitle>
          <DrawerDescription>
            Keep BlackTop visible while using your favorite nav app
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 overflow-y-auto">
          {!platform ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                Split-screen lets you see your ride stats and navigation at the same time. Select your device:
              </p>
              
              <button
                onClick={() => setPlatform('ios')}
                className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">iPhone / iPad</p>
                    <p className="text-xs text-muted-foreground">Slide Over or Split View</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>

              <button
                onClick={() => setPlatform('android')}
                className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Android</p>
                    <p className="text-xs text-muted-foreground">Split Screen mode</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          ) : platform === 'ios' ? (
            <div className="space-y-4">
              <button
                onClick={() => setPlatform(null)}
                className="text-sm text-accent flex items-center gap-1 mb-2"
              >
                ← Back
              </button>
              
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-3">iPhone Slide Over</h3>
                <ol className="text-sm space-y-3 text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">1</span>
                    <span>Open your navigation app (Google Maps, Waze, etc.)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">2</span>
                    <span>Swipe up slowly from the bottom to show the Dock</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">3</span>
                    <span>Drag BlackTop from the Dock onto the screen</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">4</span>
                    <span>BlackTop will appear as a floating window over your nav app</span>
                  </li>
                </ol>
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-3">iPad Split View</h3>
                <ol className="text-sm space-y-3 text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary text-foreground text-xs font-bold flex items-center justify-center">1</span>
                    <span>Open BlackTop, then swipe up to show the Dock</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary text-foreground text-xs font-bold flex items-center justify-center">2</span>
                    <span>Drag your nav app to the left or right edge</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary text-foreground text-xs font-bold flex items-center justify-center">3</span>
                    <span>Both apps run side-by-side with live updates</span>
                  </li>
                </ol>
              </div>

              <p className="text-xs text-muted-foreground italic">
                Tip: Add BlackTop to your Dock for quick access
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setPlatform(null)}
                className="text-sm text-accent flex items-center gap-1 mb-2"
              >
                ← Back
              </button>
              
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-3">Android Split Screen</h3>
                <ol className="text-sm space-y-3 text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">1</span>
                    <span>Open BlackTop and start your ride</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">2</span>
                    <span>Tap the Recent Apps button (square icon)</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">3</span>
                    <span>Tap the BlackTop icon at the top of the app preview</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">4</span>
                    <span>Select "Split screen" or "Open in split screen view"</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">5</span>
                    <span>Select your nav app for the other half</span>
                  </li>
                </ol>
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-2">Samsung Devices</h3>
                <p className="text-sm text-muted-foreground">
                  Use the Edge Panel: Swipe in from the right edge, then drag apps to split the screen.
                </p>
              </div>

              <p className="text-xs text-muted-foreground italic">
                Tip: Some Android phones support floating/popup windows too
              </p>
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-border pt-4">
          <Button onClick={handleOpenNav} className="w-full gap-2">
            <Navigation className="w-4 h-4" />
            Open Navigation App
            <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
          <Button variant="ghost" onClick={resetAndClose} className="w-full">
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
