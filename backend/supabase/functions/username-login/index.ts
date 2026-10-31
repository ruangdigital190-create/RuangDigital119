import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") || "https://ruangdigital190-create.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  try {
    const { username, password } = await req.json();
    const cleanUsername = String(username || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,24}$/.test(cleanUsername) || typeof password !== "string" || password.length < 1 || password.length > 256) {
      return response({ error: "Invalid credentials" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const attemptKey = await sha256(`${ip}:${cleanUsername}`);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await admin.from("auth_login_attempts").delete().lt("attempted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const { count } = await admin.from("auth_login_attempts").select("id", { count: "exact", head: true }).eq("attempt_key", attemptKey).gte("attempted_at", since);
    if ((count || 0) >= 8) return response({ error: "Too many attempts. Try again later." }, 429);

    const { data: profile, error: profileError } = await admin.from("profiles").select("email").eq("username", cleanUsername).maybeSingle();
    if (profileError || !profile?.email) {
      await admin.from("auth_login_attempts").insert({ attempt_key: attemptKey });
      return response({ error: "Invalid credentials" }, 401);
    }

    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: profile.email, password }),
    });
    const authData = await authResponse.json();
    if (!authResponse.ok || !authData.access_token || !authData.refresh_token) {
      await admin.from("auth_login_attempts").insert({ attempt_key: attemptKey });
      return response({ error: "Invalid credentials" }, 401);
    }
    await admin.from("auth_login_attempts").delete().eq("attempt_key", attemptKey);
    // Email is intentionally omitted; the browser receives only the Supabase session tokens.
    return response({ access_token: authData.access_token, refresh_token: authData.refresh_token, token_type: authData.token_type, expires_in: authData.expires_in });
  } catch (error) {
    console.error("username-login failed", error);
    return response({ error: "Login service unavailable" }, 500);
  }
});
