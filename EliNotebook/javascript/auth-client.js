"use strict";

window.addEventListener("DOMContentLoaded", () => {
  const config = window.ELI_AUTH_CONFIG || {};
  const page = document.body.dataset.authPage;
  const status = document.querySelector("#auth-status");
  const loginForm = document.querySelector("#account-login-form");
  const forgotForm = document.querySelector("#forgot-password-form");
  const resetForm = document.querySelector("#reset-password-form");
  const forgotToggle = document.querySelector("#show-forgot-password");
  const backToLogin = document.querySelector("#back-to-login");

  function setStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function absolutePath(path) { return new URL(path, window.location.href).href; }

  function safePublicConfig() {
    const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || "");
    const key = String(config.supabasePublishableKey || "");
    if (!config.enabled || !urlOk || key.length < 20 || /^sb_secret_/i.test(key) || /YOUR_/i.test(key)) return false;
    if (key.split(".").length === 3) {
      try {
        let encoded = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        encoded += "=".repeat((4 - (encoded.length % 4)) % 4);
        const payload = JSON.parse(atob(encoded));
        if (payload.role === "service_role") return false;
      } catch (_error) { return false; }
    }
    return Boolean(window.supabase?.createClient);
  }

  if (!safePublicConfig()) {
    setStatus("雲端帳號尚未啟用。目前請繼續使用原本的本機財務中心；完成Supabase設定後才會開放此頁。", "warning");
    document.querySelectorAll("form button, form input").forEach((control) => { control.disabled = true; });
    return;
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    // 重設頁由下方程式主動交換一次性PKCE驗證碼，避免既有登入工作階段被誤認成重設授權。
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: page !== "reset", flowType: "pkce", storageKey: config.authStorageKey || "eliNotebook.supabase.auth.v1" }
  });

  function passwordProblem(value) {
    const password = String(value || "").normalize("NFC");
    if (password.length < 15) return "密碼至少需要15個字元。";
    if (password.length > 64) return "密碼最多64個字元。";
    if (/^(.)\1{14,}$/u.test(password) || ["123456789012345", "passwordpassword", "elinotebook"].includes(password.toLocaleLowerCase("zh-TW").replace(/\s/g, ""))) return "這個密碼太容易被猜到，請使用不重複的長句。";
    return "";
  }

  async function goToApp() {
    window.location.replace(absolutePath(config.appPath || "./index1.html"));
  }

  async function submitLogin(event) {
    event.preventDefault();
    const submit = loginForm.querySelector("button[type=submit]");
    submit.disabled = true;
    setStatus("正在安全登入……");
    try {
      const email = loginForm.elements.email.value.trim();
      const password = loginForm.elements.password.value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) { setStatus("登入資料不正確，或帳號尚未完成信箱驗證。", "error"); return; }
      if (config.requireVerifiedEmail && !data.user?.email_confirmed_at) { await client.auth.signOut(); setStatus("請先完成註冊信箱驗證。", "error"); return; }
      if (config.requireMfa) {
        const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError || (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2")) {
          await client.auth.signOut();
          setStatus("此帳號需要第二因素驗證；TOTP挑戰介面尚未完成，因此已安全停止登入。請先把requireMfa保持為false。", "warning");
          return;
        }
      }
      await goToApp();
    } catch (error) {
      console.error("登入失敗：", error);
      setStatus("目前無法連接帳號服務，請稍後再試。", "error");
    } finally { submit.disabled = false; }
  }

  async function submitForgotPassword(event) {
    event.preventDefault();
    const submit = forgotForm.querySelector("button[type=submit]");
    submit.disabled = true;
    setStatus("正在處理申請……");
    try {
      const email = forgotForm.elements.email.value.trim();
      await client.auth.resetPasswordForEmail(email, { redirectTo: absolutePath(config.resetPath || "./reset-password.html") });
      setStatus("如果這是已註冊且完成驗證的信箱，系統會寄出一次性重設連結。請檢查收件匣；為保護帳號，本頁不會顯示該信箱是否存在。", "success");
      forgotForm.reset();
      window.setTimeout(() => { submit.disabled = false; }, 60000);
    } catch (error) {
      console.error("密碼重設申請失敗：", error);
      setStatus("如果這是已註冊且完成驗證的信箱，系統會寄出一次性重設連結。請稍後檢查收件匣。", "success");
      window.setTimeout(() => { submit.disabled = false; }, 60000);
    }
  }

  async function prepareResetPage() {
    setStatus("正在驗證一次性重設連結……");
    const resetUrl = new URL(window.location.href);
    const authorizationCode = resetUrl.searchParams.get("code");
    if (!authorizationCode) {
      resetForm.hidden = true;
      setStatus("重設連結無效、已使用或已逾期。請回到登入頁重新申請。", "error");
      return;
    }
    try {
      // PKCE交換還需要申請重設時留在同一瀏覽器的驗證資訊；只複製網址到別台裝置無法完成。
      const { data, error } = await client.auth.exchangeCodeForSession(authorizationCode);
      if (error || !data.session?.user || (config.requireVerifiedEmail && !data.session.user.email_confirmed_at)) throw error || new Error("invalid recovery session");
      // 驗證碼只能使用一次；交換完成後立刻從網址移除，避免留在歷史紀錄或被再次複製。
      window.history.replaceState({}, document.title, resetUrl.pathname);
      resetForm.hidden = false;
      setStatus("一次性連結驗證成功。請設定新的帳號密碼。財務加密金鑰復原會在後端金鑰機制完成後另行啟用。", "success");
    } catch (error) {
      console.error("重設連結驗證失敗：", error);
      resetForm.hidden = true;
      setStatus("重設連結無效、已使用、已逾期，或不是在原申請瀏覽器開啟。請回到登入頁重新申請。", "error");
    }
  }

  async function submitResetPassword(event) {
    event.preventDefault();
    const password = resetForm.elements.password.value;
    const confirmation = resetForm.elements.confirmation.value;
    const problem = passwordProblem(password);
    if (problem) { setStatus(problem, "error"); return; }
    if (password !== confirmation) { setStatus("兩次輸入的密碼不一致。", "error"); return; }
    const submit = resetForm.querySelector("button[type=submit]");
    submit.disabled = true;
    setStatus("正在更新密碼並撤銷其他登入工作階段……");
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) { setStatus("密碼更新失敗；連結可能已逾期，請重新申請。", "error"); return; }
      await client.auth.signOut({ scope: "global" });
      resetForm.reset();
      resetForm.hidden = true;
      setStatus("帳號密碼已更新，其他登入工作階段已撤銷。請回到登入頁重新登入。", "success");
    } catch (error) {
      console.error("密碼更新失敗：", error);
      setStatus("目前無法更新密碼，請稍後重新申請重設連結。", "error");
    } finally { submit.disabled = false; }
  }

  forgotToggle?.addEventListener("click", () => { loginForm.hidden = true; forgotForm.hidden = false; forgotForm.elements.email.focus(); setStatus("驗證連結只會寄到已註冊且完成驗證的信箱。"); });
  backToLogin?.addEventListener("click", () => { forgotForm.hidden = true; loginForm.hidden = false; setStatus(""); });
  loginForm?.addEventListener("submit", submitLogin);
  forgotForm?.addEventListener("submit", submitForgotPassword);
  resetForm?.addEventListener("submit", submitResetPassword);
  if (page === "reset") prepareResetPage();
  if (page === "login") {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "verify-email") setStatus("請先使用註冊信箱中的連結完成驗證。", "warning");
    else if (reason === "mfa") setStatus("此帳號需要第二因素驗證；TOTP介面將在下一階段啟用。", "warning");
    else if (reason === "not-configured") setStatus("Supabase公開設定尚未完成，因此帳號登入暫停。", "warning");
  }
});
