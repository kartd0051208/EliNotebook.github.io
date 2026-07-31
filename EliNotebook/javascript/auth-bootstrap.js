"use strict";

// 啟用雲端帳號後，在工作階段確認完成前隱藏EliNotebook，避免未登入者短暫看到本機內容。
if (window.ELI_AUTH_CONFIG?.enabled === true) {
  document.documentElement.classList.add("auth-required");
}
