"use strict";

(() => {
  const config = window.ELI_AUTH_CONFIG || {};
  if (config.enabled !== true) {
    document.documentElement.classList.remove("auth-required");
    return;
  }

  function safePublicConfig() {
    const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || "");
    const key = String(config.supabasePublishableKey || "");
    if (!urlOk || key.length < 20 || /^sb_secret_/i.test(key) || /YOUR_/i.test(key)) return false;
    if (key.split(".").length === 3) {
      try {
        let encoded = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        encoded += "=".repeat((4 - (encoded.length % 4)) % 4);
        const payload = JSON.parse(atob(encoded));
        if (payload.role === "service_role") return false;
      } catch (_error) { return false; }
    }
    return true;
  }

  function loginUrl(reason = "signin") {
    const url = new URL(config.loginPath || "./account-login.html", window.location.href);
    url.searchParams.set("reason", reason);
    return url.href;
  }

  function redirectToLogin(reason) {
    window.location.replace(loginUrl(reason));
  }

  async function verifySession() {
    try {
      const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: config.authStorageKey || "eliNotebook.supabase.auth.v1" }
      });
      window.eliSupabase = client;
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user) { redirectToLogin("signin"); return; }
      if (config.requireVerifiedEmail && !data.session.user.email_confirmed_at) { await client.auth.signOut(); redirectToLogin("verify-email"); return; }
      if (config.requireMfa) {
        const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError || (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2")) { redirectToLogin("mfa"); return; }
      }
      document.documentElement.classList.remove("auth-required");
    } catch (error) {
      console.error("帳號工作階段檢查失敗：", error);
      redirectToLogin("unavailable");
    }
  }

  if (!safePublicConfig()) { redirectToLogin("not-configured"); return; }
  const vendor = document.createElement("script");
  vendor.src = "./vendor/supabase/supabase.js";
  vendor.addEventListener("load", verifySession, { once: true });
  vendor.addEventListener("error", () => redirectToLogin("unavailable"), { once: true });
  document.head.append(vendor);
})();
