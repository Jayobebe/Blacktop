import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * The signed-in rider, from the session the phone already holds.
 * `supabase.auth.getUser()` asks the auth server every time it's called, and it
 * was being called on timers (the World location every 30 s of a ride) and on
 * every convoy and crew action. The server checks the token on every request
 * anyway (RLS), so the client only needs the id: read it locally.
 */
export async function sessionUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}
