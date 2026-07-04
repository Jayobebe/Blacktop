import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/features/convoy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, UserPlus, ScanLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { Html5Qrcode } from 'html5-qrcode';

export default function JoinConvoy() {
  const navigate = useNavigate();
  const { joinConvoy } = useConvoyState();
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-scanner';

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow alphanumeric, uppercase, max 6 chars
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(value);
  };

  const handleJoin = async (codeToJoin?: string) => {
    const joinCode = codeToJoin || code;
    if (joinCode.length !== 6) {
      toast.error('Please enter a valid 6-character code');
      return;
    }

    setIsJoining(true);
    
    try {
      const success = await joinConvoy(joinCode);
      if (success) {
        toast.success('Joined convoy successfully');
        navigate('/lobby');
      }
    } finally {
      setIsJoining(false);
    }
  };

  const startScanner = async () => {
    setShowScanner(true);
    
    // Wait for DOM to render
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Extract convoy code (expecting 6 alphanumeric chars)
          const scannedCode = decodedText.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
          if (scannedCode.length === 6) {
            stopScanner();
            setCode(scannedCode);
            toast.success('Code scanned!');
            // Auto-join after successful scan
            handleJoin(scannedCode);
          }
        },
        () => {
          // QR code not detected - ignore
        }
      );
    } catch (err) {
      console.error('[JoinConvoy] Scanner error:', err);
      toast.error('Could not access camera', { description: 'Please check camera permissions' });
      setShowScanner(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Ignore cleanup errors
      }
      scannerRef.current = null;
    }
    setShowScanner(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col p-4 landscape:p-3 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-4 landscape:mb-2 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 landscape:p-2 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5 landscape:w-4 landscape:h-4" />
        </button>
        <h1 className="text-xl landscape:text-lg font-display font-bold">Join Convoy</h1>
      </header>

      {/* QR Scanner Overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Scan Convoy QR Code</h2>
            <button
              onClick={stopScanner}
              className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div
              id={scannerContainerId}
              className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden"
            />
          </div>
          <p className="text-center text-muted-foreground text-sm pb-8">
            Point your camera at a convoy QR code
          </p>
        </div>
      )}

      <div className="flex-1 flex flex-col landscape:flex-row items-center justify-center gap-4 landscape:gap-8 animate-fade-in min-h-0">
        {/* Icon and description - left side in landscape */}
        <div className="flex flex-col items-center landscape:items-start landscape:flex-1 landscape:max-w-xs">
          <div className="w-20 h-20 landscape:w-16 landscape:h-16 rounded-full bg-secondary flex items-center justify-center mb-4 landscape:mb-2">
            <UserPlus className="w-10 h-10 landscape:w-8 landscape:h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg landscape:text-base font-display font-semibold mb-1">Enter Convoy Code</h2>
          <p className="text-muted-foreground text-center landscape:text-left text-sm landscape:text-xs max-w-xs">
            Ask your convoy leader for the 6-character code or scan the QR
          </p>
        </div>

        {/* Input and buttons - right side in landscape */}
        <div className="w-full max-w-xs space-y-3 landscape:flex-1 landscape:max-w-xs">
          <Input
            type="text"
            value={code}
            onChange={handleCodeChange}
            placeholder="XXXXXX"
            className="h-14 landscape:h-12 text-center font-mono text-3xl landscape:text-2xl tracking-widest uppercase bg-card border-2 focus:border-accent"
            maxLength={6}
            autoFocus
          />
          
          <div className="flex gap-2">
            <Button
              onClick={() => handleJoin()}
              disabled={code.length !== 6 || isJoining}
              className="flex-1 h-12 landscape:h-10 text-base landscape:text-sm font-semibold touch-target"
            >
              {isJoining ? 'Joining...' : 'Join Convoy'}
            </Button>
            
            <Button
              onClick={startScanner}
              variant="outline"
              className="h-12 landscape:h-10 px-4 touch-target"
            >
              <ScanLine className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
