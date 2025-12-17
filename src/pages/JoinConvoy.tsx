import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvoyState } from '@/hooks/useConvoyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function JoinConvoy() {
  const navigate = useNavigate();
  const { joinConvoy } = useConvoyState();
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow alphanumeric, uppercase, max 6 chars
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(value);
  };

  const handleJoin = async () => {
    if (code.length !== 6) {
      toast.error('Please enter a valid 6-character code');
      return;
    }

    setIsJoining(true);
    
    try {
      const success = await joinConvoy(code);
      if (success) {
        toast.success('Joined convoy successfully');
        navigate('/lobby');
      }
    } finally {
      setIsJoining(false);
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
        <h1 className="text-xl landscape:text-lg font-display font-bold">Join Convoy</h1>
      </header>

      <div className="flex-1 flex flex-col landscape:flex-row items-center justify-center gap-4 landscape:gap-8 animate-fade-in min-h-0">
        {/* Icon and description - left side in landscape */}
        <div className="flex flex-col items-center landscape:items-start landscape:flex-1 landscape:max-w-xs">
          <div className="w-20 h-20 landscape:w-16 landscape:h-16 rounded-full bg-secondary flex items-center justify-center mb-4 landscape:mb-2">
            <UserPlus className="w-10 h-10 landscape:w-8 landscape:h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg landscape:text-base font-display font-semibold mb-1">Enter Convoy Code</h2>
          <p className="text-muted-foreground text-center landscape:text-left text-sm landscape:text-xs max-w-xs">
            Ask your convoy leader for the 6-character code
          </p>
        </div>

        {/* Input and button - right side in landscape */}
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
          
          <Button
            onClick={handleJoin}
            disabled={code.length !== 6 || isJoining}
            className="w-full h-12 landscape:h-10 text-base landscape:text-sm font-semibold touch-target"
          >
            {isJoining ? 'Joining...' : 'Join Convoy'}
          </Button>
        </div>
      </div>
    </div>
  );
}
