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

  const handleJoin = () => {
    if (code.length !== 6) {
      toast.error('Please enter a valid 6-character code');
      return;
    }

    setIsJoining(true);
    
    // Simulate network delay
    setTimeout(() => {
      const success = joinConvoy(code);
      if (success) {
        toast.success('Joined convoy successfully');
        navigate('/lobby');
      } else {
        toast.error('Failed to join convoy');
      }
      setIsJoining(false);
    }, 500);
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
        <h1 className="text-2xl font-display font-bold">Join Convoy</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-6">
          <UserPlus className="w-12 h-12 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-display font-semibold mb-2">Enter Convoy Code</h2>
        <p className="text-muted-foreground text-center mb-8 max-w-xs">
          Ask your convoy leader for the 6-character code
        </p>

        <div className="w-full max-w-xs space-y-4">
          <Input
            type="text"
            value={code}
            onChange={handleCodeChange}
            placeholder="XXXXXX"
            className="h-16 text-center font-mono text-3xl tracking-widest uppercase bg-card border-2 focus:border-accent"
            maxLength={6}
            autoFocus
          />
          
          <Button
            onClick={handleJoin}
            disabled={code.length !== 6 || isJoining}
            className="w-full h-14 text-lg font-semibold touch-target"
          >
            {isJoining ? 'Joining...' : 'Join Convoy'}
          </Button>
        </div>
      </div>
    </div>
  );
}
