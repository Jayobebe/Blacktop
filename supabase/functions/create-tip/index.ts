import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[CREATE-TIP] STRIPE_SECRET_KEY not set");
      return new Response(JSON.stringify({ error: "Tip service unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 503,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const ALLOWED_ORIGINS = new Set([
      "https://convoy-comms.lovable.app",
      "https://blacktoplive.com",
      "https://8006f12b-bc88-412a-bd3c-677561cc727f.lovableproject.com",
      "https://id-preview--8006f12b-bc88-412a-bd3c-677561cc727f.lovable.app",
    ]);
    const rawOrigin = req.headers.get("origin") ?? "";
    const origin = ALLOWED_ORIGINS.has(rawOrigin)
      ? rawOrigin
      : "https://convoy-comms.lovable.app";

    // Only these tiers are offered in the UI - reject anything else server-side.
    const ALLOWED_AMOUNTS = [5, 10, 20];
    let amount = 5;
    try {
      const body = await req.json();
      if (ALLOWED_AMOUNTS.includes(body?.amount)) {
        amount = body.amount;
      }
    } catch {
      // no/invalid body - fall back to the default $5 tier
    }

    const priceIdEnvByAmount: Record<number, string> = {
      5: "STRIPE_PRICE_5",
      10: "STRIPE_PRICE_10",
      20: "STRIPE_PRICE_20",
    };
    const priceId = Deno.env.get(priceIdEnvByAmount[amount]);
    if (!priceId) {
      console.error(`[CREATE-TIP] Missing price ID env var for amount $${amount}`);
      return new Response(JSON.stringify({ error: "Tip tier not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 503,
      });
    }
    const lineItem = { price: priceId, quantity: 1 };

    const session = await stripe.checkout.sessions.create({
      line_items: [lineItem],
      mode: "payment",
      success_url: `${origin}/settings?tip=success`,
      cancel_url: `${origin}/settings?tip=canceled`,
      submit_type: "donate",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-TIP] ERROR:", detail);
    return new Response(
      JSON.stringify({ error: "Unable to create tip session. Please try again later." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
