(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const client = () => window.rdSupabase;
  const modal = () => $("authModal");
  const modes = ["login", "register", "forgot", "reset", "account"];
  let currentMode = "login";

  function setStatus(message, isError = false) {
    const node = $("authStatus");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
    node.classList.toggle("error", Boolean(isError));
  }

  function setMode(mode) {
    currentMode = modes.includes(mode) ? mode : "login";
    if (!( $("authHeading") )) return;
    const copy = {
      login: ["Masuk ke akun", "Login cukup menggunakan username dan password."],
      register: ["Buat akun baru", "Daftar sekali untuk menyimpan riwayat pesanan online."],
      forgot: ["Pulihkan password", "Masukkan username. Tautan pemulihan dikirim ke email terdaftar."],
      reset: ["Buat password baru", "Buat password baru setelah membuka tautan pemulihan email."],
      account: ["Akun pelanggan", "Informasi akun dan akses layanan pelanggan."]
    };
    $("authHeading").textContent = copy[currentMode][0];
    $("authSubheading").textContent = copy[currentMode][1];
    modes.forEach(name => { const panel = $("auth" + name[0].toUpperCase() + name.slice(1) + "Panel"); if (panel) panel.hidden = name !== currentMode; });
    setStatus("");
  }

  function open() {
    if (!modal()) return;
    modal().classList.add("show");
    modal().setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    const hint = $("authBackendHint");
    if (hint) hint.hidden = Boolean(window.rdBackendReady);
    if (!window.rdBackendReady) {
      setMode("login");
      ["authLoginSubmit", "authRegisterSubmit", "authForgotSubmit"].forEach(id => { if ($(id)) $(id).disabled = true; });
      setStatus(window.rdBackendMessage || "Backend belum dikonfigurasi.", true);
      return;
    }
    ["authLoginSubmit", "authRegisterSubmit", "authForgotSubmit"].forEach(id => { if ($(id)) $(id).disabled = false; });
    refreshAccount().then(profile => setMode(profile ? "account" : "login")).catch(() => setMode("login"));
  }

  function close() {
    if (!modal()) return;
    modal().classList.remove("show");
    modal().setAttribute("aria-hidden", "true");
    document.body.classList.toggle("modal-open", Boolean(document.querySelector(".feature-modal.show, #cartOverlay.show") || document.querySelector("#productModal.show")));
  }

  async function getProfile() {
    if (!window.rdBackendReady) return null;
    const { data: { user }, error: userError } = await client().auth.getUser();
    if (userError || !user) return null;
    const { data, error } = await client().from("profiles")
      .select("id,username,display_name,email,whatsapp,role,created_at")
      .eq("id", user.id).maybeSingle();
    if (error) throw error;
    return data || { id: user.id, username: user.user_metadata?.username || "pelanggan", display_name: user.user_metadata?.display_name || "Pelanggan", email: user.email, role: "customer" };
  }

  async function refreshAccount() {
    if (!window.rdBackendReady) return null;
    const { data: { session } } = await client().auth.getSession();
    if (!session) return null;
    const profile = await getProfile();
    if (!profile) return null;
    if (!( $("authAccountName") )) return profile;
    $("authAccountName").textContent = profile.display_name || profile.username;
    $("authAccountUsername").textContent = "@" + profile.username;
    $("authAvatar").textContent = (profile.display_name || profile.username || "RD").slice(0, 2).toUpperCase();
    $("authAccountDetails").innerHTML = `Email pemulihan: ${escapeText(profile.email || session.user.email || "—")}<br>WhatsApp: ${escapeText(profile.whatsapp || "Belum diisi")}<br>Status akun: ${profile.role === "admin" ? "Administrator" : "Pelanggan"}`;
    $("authAdminLink").hidden = profile.role !== "admin";
    const checkoutName = document.getElementById("checkoutName");
    const checkoutEmail = document.getElementById("checkoutEmail");
    const checkoutPhone = document.getElementById("checkoutPhone");
    if (checkoutName && !checkoutName.value) checkoutName.value = profile.display_name || "";
    if (checkoutEmail && !checkoutEmail.value) checkoutEmail.value = profile.email || session.user.email || "";
    if (checkoutPhone && !checkoutPhone.value) checkoutPhone.value = profile.whatsapp || "";
    return profile;
  }

  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  async function login(username, password, remember = true) {
    if (!window.rdBackendReady) throw new Error(window.rdBackendMessage || "Backend belum siap.");
    window.rdRememberSession = Boolean(remember);

    let result;
    try {
      result = await client().functions.invoke("username-login", { body: { username, password } });
    } catch (invokeError) {
      console.error("RUANGDIGITAL190 username-login invoke:", invokeError);
      throw new Error("Tidak dapat menghubungi layanan login. Periksa koneksi internet, CORS, dan deployment Edge Function username-login.");
    }

    const { data, error } = result || {};
    let status = Number(error?.context?.status || error?.status || 0);
    let serverError = data?.error || data?.message || "";

    // FunctionsHttpError menyimpan respons server pada error.context.
    if (error?.context && typeof error.context.clone === "function") {
      try {
        const body = await error.context.clone().json();
        serverError = body?.error || body?.message || serverError;
        status = status || Number(error.context.status || 0);
      } catch (_) { /* Respons bukan JSON; gunakan status dan pesan error yang tersedia. */ }
    }

    if (error) {
      console.error("RUANGDIGITAL190 username-login response:", { status, serverError, error });
      if (status === 404) throw new Error("Layanan username-login belum ditemukan. Deploy Edge Function 'username-login' pada project Supabase yang sama dengan website.");
      if (status === 429 || /too many attempts/i.test(String(serverError))) throw new Error("Terlalu banyak percobaan login. Tunggu 15 menit sebelum mencoba kembali.");
      if (status === 401 || status === 400 || /invalid credentials/i.test(String(serverError))) throw new Error("Username atau password tidak cocok. Pastikan akun sudah terdaftar dan username ditulis dengan benar.");
      if (status >= 500) throw new Error("Layanan login mengalami kesalahan server. Periksa secret SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, serta tabel profiles dan auth_login_attempts.");
      throw new Error("Layanan login gagal dihubungi" + (status ? " (HTTP " + status + ")" : "") + ". Periksa deployment Edge Function dan pengaturan CORS.");
    }

    if (serverError) {
      if (/too many attempts/i.test(String(serverError))) throw new Error("Terlalu banyak percobaan login. Tunggu 15 menit sebelum mencoba kembali.");
      if (/invalid credentials/i.test(String(serverError))) throw new Error("Username atau password tidak cocok. Pastikan akun sudah terdaftar dan username ditulis dengan benar.");
      throw new Error(String(serverError));
    }

    if (!data?.access_token || !data?.refresh_token) {
      throw new Error("Layanan username-login merespons tanpa token sesi. Pastikan Edge Function yang terpasang adalah versi proyek RUANGDIGITAL190.");
    }

    const { error: sessionError } = await client().auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (sessionError) throw sessionError;
    return refreshAccount();
  }

  async function register({ username, displayName, email, whatsapp, password }) {
    if (!window.rdBackendReady) throw new Error(window.rdBackendMessage);
    const cleanUsername = String(username || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,24}$/.test(cleanUsername)) throw new Error("Username harus 3–24 karakter dan hanya berisi huruf, angka, titik, garis bawah, atau tanda hubung.");
    const { data, error } = await client().auth.signUp({
      email: String(email).trim().toLowerCase(), password,
      options: { data: { username: cleanUsername, display_name: String(displayName).trim(), whatsapp: String(whatsapp || "").trim() }, emailRedirectTo: (window.RD_CONFIG.siteUrl || location.origin) + "/index.html" }
    });
    if (error) throw error;
    return data;
  }

  async function requestPasswordReset(username) {
    if (!window.rdBackendReady) throw new Error(window.rdBackendMessage);
    const { data, error } = await client().functions.invoke("username-password-reset", { body: { username: String(username || "").trim().toLowerCase() } });
    if (error) throw new Error("Permintaan belum dapat diproses. Periksa konfigurasi Edge Function dan coba lagi.");
    return data;
  }

  async function updatePassword(password) {
    if (!window.rdBackendReady) throw new Error(window.rdBackendMessage);
    const { data, error } = await client().auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  async function logout() {
    if (window.rdBackendReady) {
      // Mark this browser session inactive before Supabase clears the user context.
      await window.RDDeviceTracker?.markInactive?.();
      const { error } = await client().auth.signOut();
      if (error) throw error;
    }
    setMode("login");
    setStatus("Kamu sudah keluar dari akun.");
  }

  function setBusy(form, busy, buttonText) {
    const button = form?.querySelector('button[type="submit"]');
    if (!button) return;
    if (busy) { button.dataset.originalText = button.textContent; button.textContent = buttonText || "Memproses…"; }
    else button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = busy;
  }

  function wireForms() {
    $("authLoginForm")?.addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; setBusy(form, true, "Memeriksa akun…"); setStatus("");
      try { await login($("authLoginUsername").value, $("authLoginPassword").value, $("authRemember").checked); setMode("account"); setStatus("Login berhasil. Akun kamu sudah terhubung."); }
      catch (error) { setStatus(error.message || "Login gagal.", true); }
      finally { setBusy(form, false); }
    });
    $("authRegisterForm")?.addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; setBusy(form, true, "Membuat akun…"); setStatus("");
      const password = $("authRegPassword").value;
      if (password !== $("authRegConfirm").value) { setStatus("Konfirmasi password tidak sama.", true); setBusy(form, false); return; }
      if (password.length < 8) { setStatus("Password minimal 8 karakter.", true); setBusy(form, false); return; }
      try {
        const data = await register({ username: $("authRegUsername").value, displayName: $("authRegName").value, email: $("authRegEmail").value, whatsapp: $("authRegPhone").value, password });
        form.reset(); setMode("login");
        setStatus(data.session ? "Pendaftaran berhasil. Kamu sudah masuk." : "Pendaftaran diterima. Periksa email untuk verifikasi sebelum login.");
      } catch (error) { setStatus(error.message || "Pendaftaran gagal. Username mungkin sudah digunakan.", true); }
      finally { setBusy(form, false); }
    });
    $("authForgotForm")?.addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; setBusy(form, true, "Mengirim…"); setStatus("");
      try { await requestPasswordReset($("authForgotUsername").value); setMode("login"); setStatus("Jika username terdaftar, tautan pemulihan sudah dikirim ke email akun. Periksa kotak masuk dan folder spam."); }
      catch (error) { setStatus(error.message || "Permintaan reset gagal.", true); }
      finally { setBusy(form, false); }
    });
    $("authResetForm")?.addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; setBusy(form, true, "Menyimpan…"); setStatus("");
      const password = $("authNewPassword").value;
      if (password !== $("authNewPasswordConfirm").value) { setStatus("Konfirmasi password tidak sama.", true); setBusy(form, false); return; }
      try { await updatePassword(password); form.reset(); setMode("account"); setStatus("Password berhasil diperbarui. Gunakan password baru saat login berikutnya."); }
      catch (error) { setStatus(error.message || "Password belum dapat diperbarui. Buka ulang tautan pemulihan.", true); }
      finally { setBusy(form, false); }
    });
    document.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.authMode)));
    $("authClose")?.addEventListener("click", close);
    modal()?.addEventListener("click", event => { if (event.target === modal()) close(); });
    $("authLogout")?.addEventListener("click", async () => { try { await logout(); } catch (error) { setStatus(error.message, true); } });
    $("authOnlineOrders")?.addEventListener("click", () => { close(); document.getElementById("ordersOpen")?.click(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && modal()?.classList.contains("show")) close(); });
  }

  function init() {
    wireForms();
    if (!window.rdBackendReady) return;
    client().auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { open(); setMode("reset"); setStatus("Tautan pemulihan valid. Silakan buat password baru."); return; }
      if (event === "SIGNED_OUT") { setMode("login"); return; }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        refreshAccount().then(profile => { if (modal()?.classList.contains("show") && profile) setMode("account"); }).catch(error => console.warn("Profile refresh failed", error));
      }
    });
    client().auth.getSession().then(({ data: { session } }) => { if (session) refreshAccount().catch(error => console.warn(error)); });
    if (location.hash.includes("type=recovery")) { open(); setMode("reset"); }
  }

  window.RDAuth = { open, close, login, register, requestPasswordReset, updatePassword, logout, getProfile, refreshAccount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
