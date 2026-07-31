"use strict";

// 這個檔案只能放Supabase專案網址與「Publishable／anon」公開金鑰。
// 絕對不能放service_role、sb_secret、SMTP、簡訊供應商或資料庫密碼。
// 後端尚未完成前保持enabled:false，現有本機版EliNotebook會照常運作。
window.ELI_AUTH_CONFIG = Object.freeze({
  enabled: false,
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_OR_ANON_KEY",
  appPath: "./index1.html",
  loginPath: "./account-login.html",
  resetPath: "./reset-password.html",
  authStorageKey: "eliNotebook.supabase.auth.v1",
  requireVerifiedEmail: true,
  requireMfa: false
});
