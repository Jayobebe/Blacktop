import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/hooks/useConvoyState';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function CreateConvoy() {
  const navigate = useNavigate();
  const { createConvoy } = useConvoyState();
  const [copied, setCopied] = useState(false);
  const [convoyCode, setConvoyCode] = useState<string | null>(null);

  const handleCreate = () => {
    const { code } = createConvoy();
    setConvoyCode(code);
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
    <div className="min-h-screen flex flex-col p-4 safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/')}
          className="p-3 rounded-lg bg-secondary hover:bg-muted transition-colors touch-target"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-display font-bold">Start Convoy</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
        {!convoyCode ? (
          <>
            <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center mb-6">
              <Users className="w-12 h-12 text-accent" />
            </div>
            <h2 className="text-xl font-display font-semibold mb-2">Create Your Convoy</h2>
            <p className="text-muted-foreground text-center mb-8 max-w-xs">
              Start a new convoy and share the code with your riding crew
            </p>
            <Button
              onClick={handleCreate}
              className="w-full max-w-xs h-14 text-lg font-semibold bg-accent hover:bg-accent/90 text-accent-foreground touch-target"
            >
              Generate Convoy Code
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm uppercase tracking-wide mb-4">
              Your Convoy Code
            </p>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-3 bg-card border-2 border-accent rounded-xl px-6 py-4 mb-4 hover:bg-accent/5 transition-colors"
            >
              <span className="font-mono text-4xl font-bold tracking-widest text-accent">
                {convoyCode}
              </span>
              {copied ? (
                <Check className="w-6 h-6 text-accent" />
              ) : (
                <Copy className="w-6 h-6 text-muted-foreground" />
              )}
            </button>
            <p className="text-muted-foreground text-sm text-center mb-8 max-w-xs">
              Share this code with your crew so they can join your convoy
            </p>
            <Button
              onClick={handleContinue}
              className="w-full max-w-xs h-14 text-lg font-semibold touch-target"
            >
              Continue to Lobby
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
