import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "https://ruangdigital190-create.github.io/RuangDigital19";
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") || "https://ruangdigital190-create.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  try {
    const { username } = await req.json();
    const cleanUsername = String(username || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,24}$/.test(cleanUsername)) return response({ message: "If the account exists, a recovery email will be sent." });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: profile, error } = await admin.from("profiles").select("email").eq("username", cleanUsername).maybeSingle();
    // Always return the same public response so usernames cannot be enumerated.
    if (!error && profile?.email) {
      const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const redirectTo = `${SITE_URL.replace(/\/$/, "")}/index.html`;
      const { error: resetError } = await publicClient.auth.resetPasswordForEmail(profile.email, { redirectTo });
      if (resetError) console.error("Password recovery email could not be sent", resetError.message);
    }
    return response({ message: "If the account exists, a recovery email will be sent." });
  } catch (error) {
    console.error("username-password-reset failed", error);
    // Generic response still avoids disclosing account existence.
    return response({ message: "If the account exists, a recovery email will be sent." });
  }
});
