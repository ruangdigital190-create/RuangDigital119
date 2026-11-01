(function () {
  "use strict";

  const STORAGE_KEY = "rd190-device-id-v1";
  const USER_KEY = "rd190-last-user-id-v1";
  const HEARTBEAT_MS = 60 * 1000;
  let currentUserId = null;
  let heartbeatTimer = null;
  let started = false;

  const client = () => window.rdSupabase;

  function deviceId() {
    try {
      let value = localStorage.getItem(STORAGE_KEY);
      if (!value) {
        value = (window.crypto && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : `rd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
        localStorage.setItem(STORAGE_KEY, value);
      }
      return value;
    } catch (_) {
      return `temporary-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function browserName(ua) {
    if (/Edg\//i.test(ua)) return "Edge";
    if (/OPR\//i.test(ua)) return "Opera";
    if (/CriOS|Chrome\//i.test(ua)) return "Chrome";
    if (/FxiOS|Firefox\//i.test(ua)) return "Firefox";
    if (/Safari\//i.test(ua)) return "Safari";
    return "Browser";
  }

  function deviceLabel(ua) {
    const browser = browserName(ua);
    if (/iPad/i.test(ua)) return `iPad · ${browser}`;
    if (/iPhone|iPod/i.test(ua)) return `iPhone · ${browser}`;
    if (/Android/i.test(ua)) return `Android · ${browser}`;
    if (/Windows/i.test(ua)) return `Windows · ${browser}`;
    if (/Macintosh|Mac OS/i.test(ua)) return `Mac · ${browser}`;
    if (/Linux/i.test(ua)) return `Linux · ${browser}`;
    return `Desktop / perangkat lain · ${browser}`;
  }

  function platformName(ua) {
    if (/iPad/i.test(ua)) return "iPadOS";
    if (/iPhone|iPod/i.test(ua)) return "iOS";
    if (/Android/i.test(ua)) return "Android";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Macintosh|Mac OS/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Platform tidak diketahui";
  }

  async function touch(session) {
    if (!window.rdBackendReady || !client() || !session?.user?.id) return;
    const userId = session.user.id;
    const ua = navigator.userAgent || "";
    const now = new Date().toISOString();
    const row = {
      user_id: userId,
      device_id: deviceId(),
      device_label: deviceLabel(ua),
      platform: platformName(ua),
      user_agent: ua.slice(0, 700),
      last_seen_at: now,
      is_active: true,
      signed_out_at: null
    };

    try {
      const { error } = await client().from("device_sessions").upsert(row, {
        onConflict: "user_id,device_id"
      });
      if (error) {
        // The website still works if the optional device migration has not been applied.
        console.warn("RUANGDIGITAL190 device tracking is not ready:", error.message);
        return;
      }
      currentUserId = userId;
      try { localStorage.setItem(USER_KEY, userId); } catch (_) {}
    } catch (error) {
      console.warn("RUANGDIGITAL190 device heartbeat failed:", error);
    }
  }

  async function markInactive() {
    if (!window.rdBackendReady || !client()) return;
    let userId = currentUserId;
    if (!userId) {
      try { userId = localStorage.getItem(USER_KEY); } catch (_) {}
    }
    if (!userId) {
      try {
        const { data: { session } } = await client().auth.getSession();
        userId = session?.user?.id || null;
      } catch (_) {}
    }
    if (!userId) return;
    try {
      const { error } = await client().from("device_sessions").update({
        is_active: false,
        signed_out_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      }).eq("user_id", userId).eq("device_id", deviceId());
      if (error) console.warn("Could not mark device session inactive:", error.message);
    } catch (error) {
      console.warn("Could not mark device session inactive:", error);
    }
    currentUserId = null;
    try { localStorage.removeItem(USER_KEY); } catch (_) {}
  }

  function stopHeartbeat() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = window.setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      const { data: { session } } = await client().auth.getSession();
      if (session) await touch(session);
    }, HEARTBEAT_MS);
  }

  function init() {
    if (started || !window.rdBackendReady || !client()) return;
    started = true;

    client().auth.onAuthStateChange((event, session) => {
      if (session) {
        // Defer the database request so it does not run inside Supabase's auth callback.
        window.setTimeout(() => touch(session), 0);
        startHeartbeat();
      } else if (event === "SIGNED_OUT") {
        stopHeartbeat();
        currentUserId = null;
      }
    });

    client().auth.getSession().then(({ data: { session } }) => {
      if (session) {
        touch(session);
        startHeartbeat();
      }
    }).catch(error => console.warn("Device session initialization failed:", error));

    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      const { data: { session } } = await client().auth.getSession();
      if (session) await touch(session);
    });

    window.addEventListener("pagehide", () => {
      // A missed pagehide update is handled by the admin's last-seen timeout.
      if (currentUserId) {
        client().from("device_sessions").update({ last_seen_at: new Date().toISOString() })
          .eq("user_id", currentUserId).eq("device_id", deviceId());
      }
    });
  }

  window.RDDeviceTracker = { touch, markInactive, deviceId };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
