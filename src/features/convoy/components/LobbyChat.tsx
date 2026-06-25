import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMemberColorStyles } from '@/lib/memberColors';
import { chatMessageSchema } from '@/lib/validation';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  sender_name: string;
  content: string;
  user_id: string;
  created_at: string;
}

interface LobbyChatProps {
  convoyId: string;
  userId: string;
  userName: string;
  members: Array<{ userId: string; accentColor: string }>;
}

// Client-side rate limit: more than RATE_LIMIT_MAX_MESSAGES sends within a
// rolling RATE_LIMIT_WINDOW_MS window blocks the message locally (no DB
// insert, so no Realtime fan-out to the rest of the convoy) and disables the
// input for RATE_LIMIT_COOLDOWN_MS - keeps a scripted send-loop from blasting
// the shared chat channel.
const RATE_LIMIT_WINDOW_MS = 2000;
const RATE_LIMIT_MAX_MESSAGES = 3;
const RATE_LIMIT_COOLDOWN_MS = 5000;

export function LobbyChat({ convoyId, userId, userName, members }: LobbyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendTimestampsRef = useRef<number[]>([]);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  // Get member color by userId
  const getMemberColor = (msgUserId: string) => {
    const member = members.find(m => m.userId === msgUserId);
    return getMemberColorStyles(member?.accentColor || 'gray');
  };

  // Fetch existing messages on mount
  useEffect(() => {
    if (!convoyId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('convoy_messages')
        .select('*')
        .eq('convoy_id', convoyId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) {
        setMessages(data);
      }
    };

    fetchMessages();
  }, [convoyId]);

  // Subscribe to new messages
  useEffect(() => {
    if (!convoyId) return;

    const channel = supabase
      .channel(`convoy-chat:${convoyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'convoy_messages',
          filter: `convoy_id=eq.${convoyId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [convoyId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (isSending || isRateLimited) return;
    const parsed = chatMessageSchema.safeParse(newMessage);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid message');
      return;
    }

    // Prune to the rolling window, then check before recording this attempt.
    const now = Date.now();
    sendTimestampsRef.current = sendTimestampsRef.current.filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS
    );
    if (sendTimestampsRef.current.length >= RATE_LIMIT_MAX_MESSAGES) {
      setIsRateLimited(true);
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
      rateLimitTimerRef.current = setTimeout(() => {
        setIsRateLimited(false);
        rateLimitTimerRef.current = null;
      }, RATE_LIMIT_COOLDOWN_MS);
      return;
    }
    sendTimestampsRef.current.push(now);

    const content = parsed.data;
    setIsSending(true);
    setNewMessage('');

    const { error } = await supabase.from('convoy_messages').insert({
      convoy_id: convoyId,
      user_id: userId,
      sender_name: userName,
      content,
    });

    if (error) {
      console.error('[LobbyChat] Failed to send message:', error.message);
      setNewMessage(content); // Restore message on error
    }

    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-card/30 border border-border/30 rounded-xl overflow-hidden">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No messages yet
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === userId;
            const colorStyles = getMemberColor(msg.user_id);

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[85%]",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {!isMe && (
                  <span
                    className="text-[10px] font-medium mb-0.5 px-1"
                    style={{ color: colorStyles.text }}
                  >
                    {msg.sender_name}
                  </span>
                )}
                <div
                  className={cn(
                    "px-2.5 py-1.5 rounded-xl text-xs",
                    isMe
                      ? "bg-accent text-accent-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="p-2 border-t border-border/30 flex gap-2">
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRateLimited ? 'Sending too fast... please wait.' : 'Message...'}
          disabled={isRateLimited}
          className="h-8 text-xs bg-background/50 border-border/50"
          maxLength={200}
        />
        <Button
          onClick={handleSend}
          disabled={!newMessage.trim() || isSending || isRateLimited}
          size="sm"
          className="h-8 w-8 p-0 flex-shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
