"use strict";

// EliNotebook未來同步介面（目前故意不載入網頁、不傳送資料）。
// 只有完成後端登入、資料庫權限與LINE帳號綁定後，才可以另外實作ServerFinanceAdapter。
(function exposeFinanceSyncContract(global) {
  class LocalOnlyFinanceAdapter {
    constructor() { this.mode = "local-only"; this.enabled = false; }
    getStatus() {
      return Object.freeze({ enabled: false, mode: this.mode, message: "尚未建立後端；資料只在目前裝置的加密保險庫。" });
    }
    async pushSummary() { return Object.freeze({ ok: false, code: "BACKEND_NOT_CONFIGURED" }); }
    async pullChanges() { return Object.freeze({ ok: false, code: "BACKEND_NOT_CONFIGURED", changes: [] }); }
    async previewNaturalLanguageCommand() { return Object.freeze({ ok: false, code: "BACKEND_NOT_CONFIGURED" }); }
    async confirmNaturalLanguageCommand() { return Object.freeze({ ok: false, code: "BACKEND_NOT_CONFIGURED" }); }
  }

  const serverAdapterRequirements = Object.freeze({
    apiVersion: "v1",
    requiredMethods: ["getSession", "pushSummary", "pushChanges", "pullChanges", "previewNaturalLanguageCommand", "confirmNaturalLanguageCommand", "revokeDevice"],
    security: ["server-session", "per-user-authorization", "line-signature", "preview-before-confirm", "short-lived-command", "idempotency-key", "revision-check", "audit-log", "rate-limit", "encrypted-at-rest"]
  });

  global.EliFinanceSyncContract = Object.freeze({ LocalOnlyFinanceAdapter, serverAdapterRequirements });
})(window);
