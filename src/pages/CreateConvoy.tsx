import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/features/convoy';
import { useProfile } from '@/features/profile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Copy, Check, Loader2, MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { useDiscordIntegration, announceConvoyToDiscord } from '@/features/integrations/discord';

// Client-side floor on re-clicking "Generate Convoy Code", on top of the
// persistent already-a-leader guard in createConvoy() itself: a quick retry
// after a network failure shouldn't have to wait out the full success cooldown.
const CREATE_COOLDOWN_AFTER_SUCCESS_MS = 10000;
const CREATE_COOLDOWN_AFTER_FAILURE_MS = 5000;

export default function CreateConvoy() {
  const navigate = useNavigate();
  const { createConvoy } = useConvoyState();
  const { profile } = useProfile();
  const { integration } = useDiscordIntegration();
  const [copied, setCopied] = useState(false);
  const [convoyCode, setConvoyCode] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pinged, setPinged] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  const startCooldown = (ms: number) => {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    setIsCoolingDown(true);
    cooldownTimerRef.current = setTimeout(() => {
      setIsCoolingDown(false);
      cooldownTimerRef.current = null;
    }, ms);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await createConvoy();
      if (result) {
        setConvoyCode(result.code);
        startCooldown(CREATE_COOLDOWN_AFTER_SUCCESS_MS);
        if (integration?.auto_announce) {
          await pingDiscord(result.code);
        }
      } else {
        startCooldown(CREATE_COOLDOWN_AFTER_FAILURE_MS);
      }
    } catch (err) {
      console.error('[CreateConvoy] Unexpected error creating convoy:', err);
      toast.error('Failed to create convoy. Please check your connection and try again.');
      startCooldown(CREATE_COOLDOWN_AFTER_FAILURE_MS);
    } finally {
      setIsCreating(false);
    }
  };

  const pingDiscord = async (code: string) => {
    setPinging(true);
    const ok = await announceConvoyToDiscord({
      convoyCode: code,
      convoyName: `${profile.name}'s Convoy`,
      leaderName: profile.name,
      joinUrl: `${window.location.origin}/join?code=${encodeURIComponent(code)}`,
    });
    setPinging(false);
    if (ok) {
      setPinged(true);
      toast.success('Pinged your Discord server');
    } else {
      toast.error('Could not ping Discord');
    }
  };

  const handleCopyCode = async () => {
    if (!convoyCode) return;
    try {
      await navigator.clipboard.writeText(convoyCode);
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy code');
    }
  };

  const handleContinue = () => {
    navigate('/lobby');
  };


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
        <h1 className="text-xl landscape:text-lg font-display font-bold">Start Convoy</h1>
      </header>

      <div className="flex-1 flex flex-col landscape:flex-row items-center justify-center gap-4 landscape:gap-8 animate-fade-in min-h-0">
        {!convoyCode ? (
          <>
            {/* Icon and description */}
            <div className="flex flex-col items-center landscape:items-start landscape:flex-1 landscape:max-w-xs">
              <div className="w-20 h-20 landscape:w-16 landscape:h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4 landscape:mb-2">
                <Users className="w-10 h-10 landscape:w-8 landscape:h-8 text-accent" />
              </div>
              <h2 className="text-lg landscape:text-base font-display font-semibold mb-1">Create Your Convoy</h2>
              <p className="text-muted-foreground text-center landscape:text-left text-sm landscape:text-xs max-w-xs">
                Start a new convoy and share the code with your crew
              </p>
            </div>
            {/* Button */}
            <div className="landscape:flex-1 landscape:max-w-xs w-full max-w-xs">
              <Button
                onClick={handleCreate}
                disabled={isCreating || isCoolingDown}
                className="w-full h-12 landscape:h-10 text-base landscape:text-sm font-semibold bg-accent hover:bg-accent/90 text-accent-foreground touch-target"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Generate Convoy Code'
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Code display with QR - left side in landscape */}
            <div className="flex flex-col items-center landscape:items-start landscape:flex-1 landscape:max-w-xs">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl mb-4 landscape:mb-3">
                <QRCodeSVG
                  value={convoyCode}
                  size={140}
                  level="H"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              
              <p className="text-muted-foreground text-sm uppercase tracking-wide mb-2 landscape:mb-1">
                Your Convoy Code
              </p>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-3 bg-card border-2 border-accent rounded-xl px-5 py-3 landscape:px-4 landscape:py-2 hover:bg-accent/5 transition-colors"
              >
                <span className="font-mono text-3xl landscape:text-2xl font-bold tracking-widest text-accent">
                  {convoyCode}
                </span>
                {copied ? (
                  <Check className="w-5 h-5 text-accent" />
                ) : (
                  <Copy className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              <p className="text-muted-foreground text-sm landscape:text-xs text-center landscape:text-left mt-3 landscape:mt-2 max-w-xs">
                Share this code or scan the QR with your crew
              </p>
            </div>
            {/* Continue button - right side in landscape */}
            <div className="landscape:flex-1 landscape:max-w-xs w-full max-w-xs space-y-2">
              {integration && !integration.auto_announce && (
                <Button
                  onClick={() => pingDiscord(convoyCode)}
                  disabled={pinging || pinged}
                  variant="outline"
                  className="w-full h-12 landscape:h-10 text-sm font-semibold touch-target"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  {pinged ? 'Pinged Discord' : pinging ? 'Pinging…' : 'Ping Discord server'}
                </Button>
              )}
              {integration?.auto_announce && (
                <p className="text-[11px] text-muted-foreground text-center">
                  {pinging ? 'Pinging Discord…' : pinged ? '✓ Discord pinged' : 'Auto-pinging Discord…'}
                </p>
              )}
              <Button
                onClick={handleContinue}
                className="w-full h-12 landscape:h-10 text-base landscape:text-sm font-semibold touch-target"
              >
                Continue to Lobby
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
