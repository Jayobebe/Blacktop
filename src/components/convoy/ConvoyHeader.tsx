import { Users, Signal, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Convoy } from '@/types/convoy';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ConvoyHeaderProps {
  convoy: Convoy;
}

export function ConvoyHeader({ convoy }: ConvoyHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(convoy.code);
    setCopied(true);
    toast.success('Convoy code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="glass rounded-2xl p-4 mb-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Signal className="w-6 h-6 text-primary" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full animate-glow-pulse" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground tracking-wide">
              {convoy.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={copyCode}
                className="h-6 px-2 text-xs font-mono text-muted-foreground hover:text-primary"
              >
                {convoy.code}
                {copied ? (
                  <Check className="w-3 h-3 ml-1 text-accent" />
                ) : (
                  <Copy className="w-3 h-3 ml-1" />
                )}
              </Button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-mono text-sm font-semibold">
              {convoy.members.filter(m => m.isOnline).length}/{convoy.members.length}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
