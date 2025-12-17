import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { createProfile } = useProfile();
  const navigate = useNavigate();

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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 safe-top safe-bottom">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-semibold tracking-tight mb-3">
            BLACKTOP
          </h1>
          <p className="text-muted-foreground">
            Your ride companion
          </p>
        </div>

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

        <p className="text-xs text-muted-foreground text-center mt-10 px-4 leading-relaxed">
          Blacktop is a ride logging and communication tool, not a racing or enforcement-avoidance app.
        </p>
      </div>
    </div>
  );
}
