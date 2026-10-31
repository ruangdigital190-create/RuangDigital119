(function () {
  "use strict";
  const config = window.RD_CONFIG || {};
  const looksConfigured = /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || "") &&
    typeof config.supabaseAnonKey === "string" && config.supabaseAnonKey.length > 30 &&
    !config.supabaseUrl.includes("YOUR-PROJECT") && !config.supabaseAnonKey.includes("YOUR_");

  window.rdBackendReady = false;
  window.rdSupabase = null;
  window.rdBackendMessage = "Backend belum dikonfigurasi. Isi backend/config.json dan jalankan SQL Supabase.";
  window.rdRememberSession = true;

  if (!looksConfigured || !window.supabase || typeof window.supabase.createClient !== "function") {
    console.info("RUANGDIGITAL190: Supabase belum dikonfigurasi; mode katalog/WhatsApp tetap tersedia.");
    return;
  }

  const authStorage = {
    getItem(key) {
      try { return localStorage.getItem(key) || sessionStorage.getItem(key); }
      catch (_) { return null; }
    },
    setItem(key, value) {
      try {
        const target = window.rdRememberSession === false ? sessionStorage : localStorage;
        const other = window.rdRememberSession === false ? localStorage : sessionStorage;
        other.removeItem(key);
        target.setItem(key, value);
      } catch (error) { console.warn("Session storage is unavailable", error); }
    },
    removeItem(key) {
      try { localStorage.removeItem(key); sessionStorage.removeItem(key); }
      catch (_) { /* storage may be disabled */ }
    }
  };

  try {
    window.rdSupabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      },
      global: { headers: { "x-rd-store": "RUANGDIGITAL190" } }
    });
    window.rdBackendReady = true;
    window.rdBackendMessage = "Backend Supabase terhubung.";
  } catch (error) {
    console.error("Supabase client initialization failed", error);
    window.rdBackendMessage = "Konfigurasi Supabase tidak valid. Periksa backend/config.json.";
  }
})();
