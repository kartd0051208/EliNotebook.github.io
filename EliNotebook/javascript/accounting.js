"use strict";

// EliNotebook 3.7 私人財務中心：加密帳務、歷年分析、資金試算、分期管理、安全匯入與單筆匯出。
// 帳務資料以AES-256-GCM加密後保存在目前瀏覽器，不會傳送到GitHub或任何伺服器。
window.addEventListener("DOMContentLoaded", () => {
  const FinanceCore = window.EliFinanceCore;
  if (!FinanceCore) { console.error("財務核心模組未載入，已停止開啟私人財務中心。"); return; }
  const LEGACY_STORAGE_KEY = "eliNotebook.accounting.v1";
  const LEGACY_AUTH_KEY = "eliNotebook.financeAuth.v1";
  const VAULT_KEY = "eliNotebook.financeVault.v2";
  const THROTTLE_KEY = "eliNotebook.financeThrottle.v1";
  const KDF_ITERATIONS = 600000;
  const AUTO_LOCK_DELAY = 5 * 60 * 1000;
  const MAX_TRANSACTIONS = 10000;
  const RECENT_PAGE_SIZE = 100;
  const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
  const MAX_IMPORT_COLUMNS = 40;
  const MAX_IMPORTED_ACCOUNTS = 100;
  const MAX_IMPORTED_CATEGORIES = 200;
  const MAX_INSTALLMENTS = 200;
  const DEFAULT_EXPENSE_CATEGORIES = ["餐飲", "交通", "購物", "居住", "娛樂", "醫療", "進修", "保險", "其他支出"];
  const DEFAULT_INCOME_CATEGORIES = ["薪資", "獎金", "投資", "退款", "其他收入"];
  const TYPE_LABEL = { expense: "支出", income: "收入", transfer: "轉移" };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    financeAuth: $("#finance-auth"), financeContent: $("#finance-content"), authForm: $("#finance-auth-form"),
    authDescription: $("#finance-auth-description"), pin: $("#finance-pin"), pinConfirm: $("#finance-pin-confirm"),
    pinConfirmLabel: $("#finance-pin-confirm-label"), authSubmit: $("#finance-auth-submit"), authFeedback: $("#finance-auth-feedback"),
    forgotPin: $("#finance-forgot-pin"), financeLock: $("#finance-lock"),
    tabs: [...document.querySelectorAll("[data-accounting-tab]")],
    panels: [...document.querySelectorAll("[data-accounting-panel]")],
    naturalForm: $("#natural-entry-form"), naturalInput: $("#natural-entry"), naturalFeedback: $("#natural-feedback"),
    fixedForm: $("#fixed-entry-form"), fixedInput: $("#fixed-entry"), fixedFeedback: $("#fixed-feedback"),
    buttonForm: $("#button-entry-form"), typeButtons: [...document.querySelectorAll("[data-money-type]")],
    type: $("#money-type"), amount: $("#money-amount"), category: $("#money-category"), account: $("#money-account"),
    toAccount: $("#money-to-account"), toAccountLabel: $("#money-to-account-label"), date: $("#money-date"), note: $("#money-note"),
    income: $("#accounting-income"), expense: $("#accounting-expense"), net: $("#accounting-net"),
    availableFunds: $("#available-funds"), availableFundsDetail: $("#available-funds-detail"), paydayCountdown: $("#payday-countdown"), paydayDate: $("#payday-date"),
    installmentRemaining: $("#installment-remaining"), installmentStatus: $("#installment-status"), dashboardDate: $("#planning-dashboard-date"),
    dueBeforePayday: $("#due-before-payday"), upcomingInstallments: $("#upcoming-installment-list"),
    periodMode: $("#transaction-period-mode"), monthFilter: $("#transaction-month"), monthFilterLabel: $("#transaction-month-label"),
    yearFilter: $("#transaction-year"), yearFilterLabel: $("#transaction-year-label"), typeFilter: $("#transaction-type-filter"), search: $("#transaction-search"),
    transactionList: $("#transaction-list"), transactionCount: $("#transaction-result-count"), transactionLoadMore: $("#transaction-load-more"),
    summaryMonth: $("#summary-month"), previousMonth: $("#month-previous"), nextMonth: $("#month-next"),
    summaryIncome: $("#summary-income"), summaryExpense: $("#summary-expense"), summaryNet: $("#summary-net"), summaryCount: $("#summary-count"),
    previousComparisonTitle: $("#previous-month-comparison-title"), previousComparison: $("#previous-month-comparison"),
    priorYearComparisonTitle: $("#prior-year-comparison-title"), priorYearComparison: $("#prior-year-comparison"),
    monthlyCategories: $("#monthly-category-list"), cashflowBody: $("#cashflow-body"), expenseChart: $("#expense-chart"), balanceChart: $("#balance-chart"), trendChart: $("#trend-chart"),
    trendPriorYear: $("#trend-prior-year-toggle"), trendSummary: $("#trend-comparison-summary"),
    accountForm: $("#account-form"), accountName: $("#account-name"), accountBalance: $("#account-balance"), accountList: $("#account-list"),
    categoryForm: $("#category-form"), categoryType: $("#category-type"), categoryName: $("#category-name"), customCategories: $("#custom-category-list"),
    planningForm: $("#planning-settings-form"), salaryDay: $("#salary-day"), reserveAmount: $("#reserve-amount"), includeInstallments: $("#include-installments"), planningFeedback: $("#planning-settings-feedback"),
    installmentForm: $("#installment-form"), installmentName: $("#installment-name"), installmentTotal: $("#installment-total"), installmentCount: $("#installment-count"), installmentPaid: $("#installment-paid"),
    installmentFirstMonth: $("#installment-first-month"), installmentDueDay: $("#installment-due-day"), installmentFeedback: $("#installment-feedback"), installmentList: $("#installment-list"),
    exportJson: $("#money-export-json"), exportXlsx: $("#money-export-xlsx"), exportCsv: $("#money-export-csv"), importFile: $("#money-import-file"),
    importPreview: $("#money-import-preview"), importSummary: $("#money-import-summary"), importErrors: $("#money-import-errors"),
    importConfirm: $("#money-import-confirm"), importCancel: $("#money-import-cancel")
  };

  let ledger = loadLegacyLedger();
  let deletedTransaction = null;
  let undoTimer = null;
  let financeUnlocked = false;
  let financeAuthMode = "unlock";
  let financeLockTimer = null;
  let financeKey = null;
  let vaultSalt = null;
  let saveSequence = Promise.resolve();
  let vaultGeneration = 0;
  let visibleTransactionCount = RECENT_PAGE_SIZE;
  let pendingImport = null;
  let activeImportWorker = null;
  let spreadsheetLibraryPromise = null;
  let ledgerRevision = 0;

  function createId(prefix = "item") {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function currentMonth() { return localDateKey().slice(0, 7); }
  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
  function shiftMonthKey(value, offset) {
    const match = /^(\d{4})-(\d{2})$/.exec(value || "");
    if (!match) return currentMonth();
    return monthKey(new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  }
  function isValidDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
  }
  function money(value) { return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Number(value) || 0); }
  function safeNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
  function cleanText(value, max = 100) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return window.btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = window.atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  const VAULT_AAD = new TextEncoder().encode("EliNotebook Finance Vault v2");

  function isValidVault(value) {
    if (!value || value.version !== 2 || value.algorithm !== "AES-256-GCM" || value.kdf !== "PBKDF2-HMAC-SHA-256") return false;
    if (!Number.isInteger(value.iterations) || value.iterations < 600000 || value.iterations > 2000000) return false;
    try {
      return base64ToBytes(value.salt).length === 16 && base64ToBytes(value.iv).length === 12 && base64ToBytes(value.ciphertext).length >= 17;
    } catch (_error) { return false; }
  }

  function readVault() {
    try {
      const parsed = JSON.parse(localStorage.getItem(VAULT_KEY) || "null");
      return isValidVault(parsed) ? parsed : null;
    } catch (error) {
      console.warn("無法讀取加密保險庫：", error);
      return null;
    }
  }

  function normalizePassphrase(value) { return String(value || "").normalize("NFC"); }

  function passphraseProblem(value) {
    const passphrase = normalizePassphrase(value);
    if (passphrase.length < 15) return "財務密碼至少需要15個字元。";
    if (passphrase.length > 64) return "財務密碼最多64個字元。";
    const compact = passphrase.toLocaleLowerCase("zh-TW").replace(/\s/g, "");
    const blocked = ["123456789012345", "passwordpassword", "elinotebook", "私人財務中心", "qwertyuiopasdfg"];
    if (blocked.some((item) => compact === item) || /^(.)\1{14,}$/u.test(passphrase)) return "這個密碼太容易被猜到，請改用較長且不常見的句子。";
    return "";
  }

  async function deriveVaultKey(passphrase, salt, iterations = KDF_ITERATIONS) {
    if (!window.crypto?.subtle) throw new Error("目前瀏覽器不支援Web Crypto");
    const material = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(normalizePassphrase(passphrase)), "PBKDF2", false, ["deriveKey"]);
    return window.crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function encryptLedgerData(value, key, salt, iterations = KDF_ITERATIONS) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: VAULT_AAD, tagLength: 128 }, key, plaintext);
    return { app: "EliNotebook Encrypted Finance", version: 2, algorithm: "AES-256-GCM", kdf: "PBKDF2-HMAC-SHA-256", iterations, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)), updatedAt: new Date().toISOString() };
  }

  async function decryptVault(vault, key) {
    const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.iv), additionalData: VAULT_AAD, tagLength: 128 }, key, base64ToBytes(vault.ciphertext));
    return normalizeLedger(JSON.parse(new TextDecoder().decode(plaintext)));
  }

  function readThrottle() {
    try { const value = JSON.parse(localStorage.getItem(THROTTLE_KEY) || "null"); return value || { failures: 0, blockedUntil: 0 }; }
    catch (_error) { return { failures: 0, blockedUntil: 0 }; }
  }

  function recordFailedAttempt() {
    const current = readThrottle();
    const failures = (current.failures || 0) + 1;
    const delaySeconds = failures >= 5 ? Math.min(30 * (2 ** (failures - 5)), 900) : 0;
    const next = { failures, blockedUntil: delaySeconds ? Date.now() + delaySeconds * 1000 : 0 };
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(next));
    return next;
  }

  function initFinanceAuth() {
    const configured = Boolean(readVault());
    financeAuthMode = configured ? "unlock" : "setup";
    elements.financeAuth.hidden = false;
    elements.financeContent.hidden = true;
    elements.pinConfirmLabel.hidden = configured;
    elements.pinConfirm.required = !configured;
    elements.authSubmit.textContent = configured ? "解密並開啟" : "建立加密保險庫";
    elements.authDescription.textContent = configured
      ? "請輸入財務密碼，資料會在目前裝置記憶體中解密。"
      : "第一次使用或從舊版升級：請設定15–64字元財務密碼，現有帳務會自動加密。";
    elements.forgotPin.hidden = !configured;
    elements.authFeedback.textContent = "";
    window.setTimeout(() => elements.pin.focus(), 0);
  }

  function unlockFinance() {
    financeUnlocked = true;
    localStorage.removeItem(THROTTLE_KEY);
    elements.financeAuth.hidden = true;
    elements.financeContent.hidden = false;
    elements.authForm.reset();
    scheduleFinanceLock();
    renderAccounting();
  }

  function lockFinance(message = "私人財務中心已上鎖，請重新輸入財務密碼。") {
    if (!financeUnlocked && elements.financeContent.hidden) return;
    // 上鎖時同步關閉單筆匯出視窗，清除模組記憶體中暫存的已解密單筆資料。
    window.EliSingleExport?.close();
    clearImportPreview();
    if (activeImportWorker) { activeImportWorker.terminate(); activeImportWorker = null; }
    financeUnlocked = false;
    financeKey = null;
    vaultSalt = null;
    ledger = defaultLedger();
    window.clearTimeout(financeLockTimer);
    elements.financeContent.hidden = true;
    elements.financeAuth.hidden = false;
    elements.pinConfirmLabel.hidden = true;
    elements.pinConfirm.required = false;
    elements.authSubmit.textContent = "解密並開啟";
    elements.authDescription.textContent = message;
    elements.authFeedback.textContent = "";
    elements.authForm.reset();
    window.setTimeout(() => elements.pin.focus(), 0);
  }

  function scheduleFinanceLock() {
    if (!financeUnlocked) return;
    window.clearTimeout(financeLockTimer);
    financeLockTimer = window.setTimeout(() => lockFinance("已閒置5分鐘，加密金鑰已從記憶體移除。"), AUTO_LOCK_DELAY);
  }

  async function handleFinanceAuth(event) {
    event.preventDefault();
    const passphrase = normalizePassphrase(elements.pin.value);
    const throttle = readThrottle();
    if (Date.now() < throttle.blockedUntil) {
      elements.authFeedback.textContent = `驗證已暫停，請在${Math.ceil((throttle.blockedUntil - Date.now()) / 1000)}秒後再試。`;
      return;
    }
    if (financeAuthMode === "setup") {
      const problem = passphraseProblem(passphrase);
      if (problem) { elements.authFeedback.textContent = problem; return; }
      if (passphrase !== normalizePassphrase(elements.pinConfirm.value)) { elements.authFeedback.textContent = "兩次輸入的財務密碼不一致。"; return; }
    }
    elements.authSubmit.disabled = true;
    elements.authFeedback.textContent = financeAuthMode === "setup" ? "正在建立加密保險庫……" : "正在衍生金鑰並解密……";
    try {
      if (financeAuthMode === "setup") {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveVaultKey(passphrase, salt);
        const vault = await encryptLedgerData(ledger, key, salt);
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
        financeKey = key;
        vaultSalt = salt;
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_AUTH_KEY);
        financeAuthMode = "unlock";
        elements.forgotPin.hidden = false;
        unlockFinance();
      } else {
        const vault = readVault();
        if (!vault) { initFinanceAuth(); return; }
        const salt = base64ToBytes(vault.salt);
        const key = await deriveVaultKey(passphrase, salt, vault.iterations || KDF_ITERATIONS);
        try { ledger = await decryptVault(vault, key); }
        catch (_error) {
          const next = recordFailedAttempt();
          elements.authFeedback.textContent = next.blockedUntil ? `密碼不正確，已暫停驗證${Math.ceil((next.blockedUntil - Date.now()) / 1000)}秒。` : `密碼不正確，已失敗${next.failures}次。`;
          elements.pin.select();
          return;
        }
        financeKey = key;
        vaultSalt = salt;
        unlockFinance();
      }
    } catch (error) {
      console.error("加密保險庫操作失敗：", error);
      elements.authFeedback.textContent = "無法開啟加密保險庫。請確認網站使用HTTPS且瀏覽器支援Web Crypto。";
    } finally {
      elements.authSubmit.disabled = false;
    }
  }

  function forgetFinancePin() {
    const first = window.confirm("忘記財務密碼無法解密或復原。繼續會清除目前瀏覽器中的加密財務資料。是否繼續？");
    if (!first) return;
    const second = window.confirm("最後確認：永久清除全部財務帳戶、分類及交易？備忘錄不受影響。");
    if (!second) return;
    vaultGeneration += 1;
    localStorage.removeItem(VAULT_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_AUTH_KEY);
    localStorage.removeItem(THROTTLE_KEY);
    ledger = defaultLedger();
    financeKey = null;
    vaultSalt = null;
    financeUnlocked = false;
    initFinanceAuth();
    renderAccounting();
  }

  function defaultLedger() {
    return {
      version: 2,
      accounts: [{ id: createId("account"), name: "現金", openingBalance: 0 }, { id: createId("account"), name: "銀行帳戶", openingBalance: 0 }],
      categories: { expense: [...DEFAULT_EXPENSE_CATEGORIES], income: [...DEFAULT_INCOME_CATEGORIES] },
      transactions: [],
      planning: FinanceCore.normalizePlanning(null),
      installments: []
    };
  }

  function normalizeLedger(value) {
    const fallback = defaultLedger();
    if (!value || typeof value !== "object") return fallback;
    const accounts = Array.isArray(value.accounts) ? value.accounts.map((account) => ({
      id: cleanText(account?.id, 80) || createId("account"), name: cleanText(account?.name, 30), openingBalance: safeNumber(account?.openingBalance)
    })).filter((account) => account.name) : fallback.accounts;
    if (!accounts.length) accounts.push(...fallback.accounts);
    const accountIds = new Set(accounts.map((account) => account.id));
    const categories = {
      expense: [...new Set([...(Array.isArray(value.categories?.expense) ? value.categories.expense : []), ...DEFAULT_EXPENSE_CATEGORIES].map((item) => cleanText(item, 20)).filter(Boolean))],
      income: [...new Set([...(Array.isArray(value.categories?.income) ? value.categories.income : []), ...DEFAULT_INCOME_CATEGORIES].map((item) => cleanText(item, 20)).filter(Boolean))]
    };
    const transactions = Array.isArray(value.transactions) ? value.transactions.map((item) => normalizeTransaction(item, accounts[0].id, accountIds)).filter(Boolean).slice(0, MAX_TRANSACTIONS) : [];
    const planning = FinanceCore.normalizePlanning(value.planning);
    const installments = Array.isArray(value.installments)
      ? value.installments.map((item) => FinanceCore.normalizeInstallment(item, cleanText(item?.id, 100) || createId("installment"))).filter(Boolean).slice(0, 200)
      : [];
    return { version: 2, accounts, categories, transactions, planning, installments };
  }

  function normalizeTransaction(item, fallbackAccountId, accountIds = new Set()) {
    if (!item || typeof item !== "object") return null;
    const type = ["expense", "income", "transfer"].includes(item.type) ? item.type : "expense";
    const amount = Math.round(Math.abs(safeNumber(item.amount)));
    if (!amount) return null;
    const accountId = accountIds.has(item.accountId) ? item.accountId : fallbackAccountId;
    const toAccountId = type === "transfer" && accountIds.has(item.toAccountId) ? item.toAccountId : "";
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return null;
    const date = isValidDateKey(item.date) ? item.date : localDateKey();
    const transaction = {
      id: cleanText(item.id, 100) || createId("transaction"), type, amount,
      category: type === "transfer" ? "帳戶轉移" : cleanText(item.category, 20) || (type === "income" ? "其他收入" : "其他支出"),
      accountId, toAccountId, note: cleanText(item.note), date,
      createdAt: Number.isNaN(Date.parse(item.createdAt)) ? new Date().toISOString() : item.createdAt,
      updatedAt: Number.isNaN(Date.parse(item.updatedAt)) ? new Date().toISOString() : item.updatedAt
    };
    transaction.fingerprint = fingerprint(transaction);
    return transaction;
  }

  function fingerprint(transaction) {
    const source = [transaction.type, transaction.amount, transaction.category, transaction.accountId, transaction.toAccountId || "", transaction.note || "", transaction.date].join("|").toLowerCase();
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return `local-${(hash >>> 0).toString(16)}`;
  }

  function loadLegacyLedger() {
    try { return normalizeLedger(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null")); }
    catch (error) { console.error("無法讀取舊版帳務資料：", error); return defaultLedger(); }
  }

  function saveLedger() {
    if (!financeKey || !vaultSalt) { alert("加密金鑰不存在，請重新解鎖私人財務中心。"); return false; }
    ledgerRevision += 1;
    const snapshot = JSON.parse(JSON.stringify(ledger));
    const key = financeKey;
    const salt = new Uint8Array(vaultSalt);
    const generation = vaultGeneration;
    saveSequence = saveSequence.then(async () => {
      const current = readVault();
      const vault = await encryptLedgerData(snapshot, key, salt, current?.iterations || KDF_ITERATIONS);
      if (generation === vaultGeneration) localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    }).catch((error) => {
      console.error("無法加密儲存帳務資料：", error);
      alert("帳務資料無法加密儲存。請立即保持頁面開啟並匯出加密備份，避免資料遺失。");
    });
    return true;
  }

  function accountName(id) { return ledger.accounts.find((account) => account.id === id)?.name || "未知帳戶"; }
  function categoriesFor(type) { return type === "income" ? ledger.categories.income : ledger.categories.expense; }

  function addTransaction(input, feedbackElement) {
    if (ledger.transactions.length >= MAX_TRANSACTIONS) { alert("已達10,000筆上限，請先匯出備份並整理舊資料。"); return false; }
    const accountIds = new Set(ledger.accounts.map((account) => account.id));
    const transaction = normalizeTransaction({ ...input, id: createId("transaction"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ledger.accounts[0].id, accountIds);
    if (!transaction) { if (feedbackElement) feedbackElement.textContent = "資料不完整，請檢查金額與帳戶。"; return false; }
    if (ledger.transactions.some((item) => item.fingerprint === transaction.fingerprint)) {
      if (!window.confirm("偵測到相同日期、金額、帳戶與備註的紀錄。仍要新增嗎？")) return false;
    }
    ledger.transactions.unshift(transaction);
    if (!saveLedger()) { ledger.transactions.shift(); return false; }
    if (feedbackElement) feedbackElement.textContent = `已新增：${TYPE_LABEL[transaction.type]} ${money(transaction.amount)}｜${transaction.category}｜${accountName(transaction.accountId)}`;
    renderAccounting();
    return true;
  }

  function inferCategory(text, type) {
    const all = categoriesFor(type);
    const direct = all.find((category) => text.includes(category));
    if (direct) return direct;
    const rules = type === "income"
      ? [[/薪水|薪資|月薪/, "薪資"], [/獎金|紅包/, "獎金"], [/股息|配息|利息|投資/, "投資"], [/退款|退費/, "退款"]]
      : [[/早餐|午餐|晚餐|便當|咖啡|飲料|餐/, "餐飲"], [/公車|捷運|計程車|加油|停車|交通/, "交通"], [/房租|水費|電費|瓦斯|居住/, "居住"], [/電影|遊戲|娛樂/, "娛樂"], [/醫院|看診|藥局|醫療/, "醫療"], [/課程|書籍|進修/, "進修"], [/保費|保險/, "保險"], [/購物|買/, "購物"]];
    return rules.find(([pattern]) => pattern.test(text))?.[1] || (type === "income" ? "其他收入" : "其他支出");
  }

  function parseNatural(text) {
    const amountMatch = text.replace(/,/g, "").match(/(?:\$|＄)?\s*(\d+(?:\.\d+)?)/);
    if (!amountMatch) return null;
    const amount = Math.round(Number(amountMatch[1]));
    const type = /轉帳|轉移|轉到/.test(text) ? "transfer" : /收入|薪水|薪資|獎金|入帳|退款|配息/.test(text) ? "income" : "expense";
    const matchedAccounts = ledger.accounts.filter((account) => text.includes(account.name));
    const accountId = matchedAccounts[0]?.id || ledger.accounts[0].id;
    const toAccountId = type === "transfer" ? matchedAccounts[1]?.id || "" : "";
    const category = type === "transfer" ? "帳戶轉移" : inferCategory(text, type);
    const note = cleanText(text.replace(amountMatch[0], "").replace(/收入|支出|轉帳|轉移|轉到/g, "").replace(new RegExp(ledger.accounts.map((account) => account.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g"), "").trim()) || category;
    return { type, amount, category, accountId, toAccountId, note, date: localDateKey() };
  }

  function parseFixed(text) {
    const parts = text.split(/[｜|]/).map((part) => part.trim());
    if (parts.length < 4) return null;
    const type = parts[0] === "收入" ? "income" : parts[0] === "轉移" || parts[0] === "轉帳" ? "transfer" : parts[0] === "支出" ? "expense" : "";
    if (!type) return null;
    const account = ledger.accounts.find((item) => item.name === parts[3]);
    const toAccount = type === "transfer" ? ledger.accounts.find((item) => item.name === parts[4]) : null;
    return { type, category: type === "transfer" ? "帳戶轉移" : parts[1], amount: Number(parts[2].replace(/,/g, "")), accountId: account?.id || "", toAccountId: toAccount?.id || "", note: type === "transfer" ? parts[5] || "" : parts[4] || "", date: localDateKey() };
  }

  function totalsForMonth(month) {
    const items = ledger.transactions.filter((item) => item.date.startsWith(month));
    const income = items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
    return { items, income, expense, net: income - expense };
  }

  function accountBalance(accountId) {
    const account = ledger.accounts.find((item) => item.id === accountId);
    if (!account) return 0;
    return ledger.transactions.reduce((balance, transaction) => {
      if (transaction.type === "income" && transaction.accountId === accountId) return balance + transaction.amount;
      if (transaction.type === "expense" && transaction.accountId === accountId) return balance - transaction.amount;
      if (transaction.type === "transfer" && transaction.accountId === accountId) return balance - transaction.amount;
      if (transaction.type === "transfer" && transaction.toAccountId === accountId) return balance + transaction.amount;
      return balance;
    }, account.openingBalance);
  }

  function planningDashboard() {
    return FinanceCore.computeDashboard({
      accountBalances: ledger.accounts.map((account) => accountBalance(account.id)),
      planning: ledger.planning,
      installments: ledger.installments,
      now: new Date()
    });
  }

  function renderPlanningDashboard() {
    const dashboard = planningDashboard();
    elements.dashboardDate.textContent = `計算日 ${dashboard.asOf}`;
    elements.availableFunds.textContent = money(dashboard.availableFunds);
    elements.availableFunds.classList.toggle("negative", dashboard.availableFunds < 0);
    elements.availableFundsDetail.textContent = ledger.planning.salaryDay
      ? `帳戶 ${money(dashboard.currentBalance)}－預留 ${money(dashboard.reserveAmount)}－發薪日前分期 ${money(dashboard.dueBeforePayday)}`
      : `尚未設定發薪日；目前只扣除預留金 ${money(dashboard.reserveAmount)}，尚未扣除近期分期`;
    elements.paydayCountdown.textContent = dashboard.daysUntilPayday === null ? "尚未設定" : dashboard.daysUntilPayday === 0 ? "就是今天" : `${dashboard.daysUntilPayday} 天`;
    elements.paydayDate.textContent = dashboard.payday ? `預計發薪日 ${dashboard.payday}` : "請到下方設定每月發薪日";
    elements.installmentRemaining.textContent = money(dashboard.installmentRemainingAmount);
    elements.installmentStatus.textContent = dashboard.activeInstallmentCount
      ? `${dashboard.activeInstallmentCount} 項進行中${dashboard.overdueInstallmentCount ? `｜${dashboard.overdueInstallmentCount} 項可能逾期` : ""}`
      : "目前沒有進行中的分期";
    elements.dueBeforePayday.textContent = dashboard.payday
      ? `下次發薪日前應繳 ${money(dashboard.dueBeforePayday)}`
      : "設定發薪日後顯示應繳金額";

    const upcoming = dashboard.installments.filter((item) => !item.complete && item.nextPayment).sort((a, b) => a.nextPayment.dueDateKey.localeCompare(b.nextPayment.dueDateKey)).slice(0, 4);
    const rows = upcoming.map((item) => {
      const row = document.createElement("div"); row.className = `mini-installment${item.overdue ? " overdue" : ""}`;
      const text = document.createElement("span"); text.textContent = `${item.name}｜${item.nextPayment.dueDateKey}${item.overdue ? "（可能逾期）" : ""}`;
      const amount = document.createElement("strong"); amount.textContent = money(item.nextPayment.amount);
      row.append(text, amount); return row;
    });
    elements.upcomingInstallments.replaceChildren(...(rows.length ? rows : [emptyBox("目前沒有待繳分期。")]));
  }

  function changeInstallmentProgress(id, delta) {
    const item = ledger.installments.find((installment) => installment.id === id);
    if (!item) return;
    const before = item.paidCount;
    item.paidCount = Math.min(item.installmentCount, Math.max(0, item.paidCount + delta));
    if (before === item.paidCount) return;
    if (!saveLedger()) item.paidCount = before;
    renderAccounting();
  }

  function removeInstallment(id) {
    const item = ledger.installments.find((installment) => installment.id === id);
    if (!item || !window.confirm(`確定刪除分期「${item.name}」？這不會刪除已記錄的收支。`)) return;
    const before = [...ledger.installments];
    ledger.installments = ledger.installments.filter((installment) => installment.id !== id);
    if (!saveLedger()) ledger.installments = before;
    renderAccounting();
  }

  function renderInstallments() {
    const dashboard = planningDashboard();
    elements.salaryDay.value = ledger.planning.salaryDay || "";
    elements.reserveAmount.value = String(ledger.planning.reserveAmount);
    elements.includeInstallments.checked = ledger.planning.includeInstallments;
    if (!elements.installmentFirstMonth.value) elements.installmentFirstMonth.value = currentMonth();

    const rows = dashboard.installments.map((item) => {
      const row = document.createElement("article"); row.className = `installment-row${item.complete ? " complete" : ""}${item.overdue ? " overdue" : ""}`;
      const main = document.createElement("div"); main.className = "installment-row-main";
      const title = document.createElement("strong"); title.textContent = item.name;
      const meta = document.createElement("span");
      meta.textContent = item.complete
        ? `${item.installmentCount} 期已全部完成`
        : `已繳 ${item.paidCount}/${item.installmentCount} 期｜下期 ${item.nextPayment.dueDateKey}${item.overdue ? "（可能逾期）" : ""}`;
      main.append(title, meta);
      const amounts = document.createElement("div"); amounts.className = "installment-amounts";
      const remaining = document.createElement("strong"); remaining.textContent = `剩餘 ${money(item.remainingAmount)}`;
      const next = document.createElement("span"); next.textContent = item.nextPayment ? `下期 ${money(item.nextPayment.amount)}` : "已完成";
      amounts.append(remaining, next);
      const actions = document.createElement("div"); actions.className = "installment-actions";
      const undo = document.createElement("button"); undo.type = "button"; undo.textContent = "復原一期"; undo.disabled = item.paidCount <= 0; undo.addEventListener("click", () => changeInstallmentProgress(item.id, -1));
      const pay = document.createElement("button"); pay.type = "button"; pay.textContent = "繳一期"; pay.disabled = item.complete; pay.addEventListener("click", () => changeInstallmentProgress(item.id, 1));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "刪除"; remove.addEventListener("click", () => removeInstallment(item.id));
      actions.append(undo, pay, remove); row.append(main, amounts, actions); return row;
    });
    elements.installmentList.replaceChildren(...(rows.length ? rows : [emptyBox("目前沒有分期計畫。新增後會在這裡顯示剩餘金額與下一期。")]));
  }

  function fillSelect(select, values, selected) {
    select.replaceChildren(...values.map(({ value, label }) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = value === selected; return option;
    }));
  }

  function refreshEntryFields() {
    const type = elements.type.value;
    fillSelect(elements.category, categoriesFor(type).map((category) => ({ value: category, label: category })), elements.category.value);
    const accounts = ledger.accounts.map((account) => ({ value: account.id, label: `${account.name}（${money(accountBalance(account.id))}）` }));
    fillSelect(elements.account, accounts, elements.account.value);
    fillSelect(elements.toAccount, accounts.filter((account) => account.value !== elements.account.value), elements.toAccount.value);
    elements.toAccountLabel.hidden = type !== "transfer";
    elements.category.closest("label").hidden = type === "transfer";
  }

  function renderTransactionCard(transaction) {
    const card = document.createElement("article");
    card.className = `transaction-card ${transaction.type}`;
    const main = document.createElement("div"); main.className = "transaction-main";
    const title = document.createElement("strong"); title.textContent = transaction.note || transaction.category;
    const meta = document.createElement("span"); meta.textContent = `${transaction.date}｜${transaction.category}｜${accountName(transaction.accountId)}${transaction.type === "transfer" ? ` → ${accountName(transaction.toAccountId)}` : ""}`;
    main.append(title, meta);
    const amount = document.createElement("b"); amount.textContent = `${transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : "↔"}${money(transaction.amount)}`;
    const actions = document.createElement("div"); actions.className = "transaction-actions";
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "修改"; edit.addEventListener("click", () => editTransaction(transaction.id));
    const exportOne = document.createElement("button"); exportOne.type = "button"; exportOne.textContent = "匯出"; exportOne.addEventListener("click", () => exportSingleTransaction(transaction));
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "刪除"; remove.addEventListener("click", () => deleteTransaction(transaction.id));
    actions.append(edit, exportOne, remove); card.append(main, amount, actions); return card;
  }

  // 特性：只匯出使用者點選的一筆已解鎖交易，並交由共用模組在本機建立檔案。
  // 效果：不會解密或匯出整本帳簿；下載前還會再次提醒匯出檔本身沒有加密。
  function exportSingleTransaction(transaction) {
    if (!financeUnlocked) { alert("請先解鎖私人財務中心。"); return; }
    if (!window.EliSingleExport) { alert("單筆匯出元件未載入，請重新整理後再試。"); return; }
    const formatTimestamp = (value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "無紀錄" : date.toLocaleString("zh-TW", { hour12: false });
    };
    window.EliSingleExport.open({
      kind: "finance",
      title: "EliNotebook 單筆財務紀錄",
      filenameBase: `EliNotebook-finance-${transaction.date}-${String(transaction.id).slice(0, 14)}`,
      fields: [
        { label: "日期", value: transaction.date },
        { label: "類型", value: TYPE_LABEL[transaction.type] },
        { label: "分類", value: transaction.category },
        { label: "金額", value: String(transaction.amount), spreadsheetValue: transaction.amount },
        { label: "帳戶", value: accountName(transaction.accountId) },
        { label: "轉入帳戶", value: transaction.toAccountId ? accountName(transaction.toAccountId) : "不適用" },
        { label: "備註", value: transaction.note || "（無）" },
        { label: "建立時間", value: formatTimestamp(transaction.createdAt) },
        { label: "修改時間", value: formatTimestamp(transaction.updatedAt) }
      ]
    });
  }

  function filteredTransactions() {
    const periodMode = elements.periodMode.value;
    const month = elements.monthFilter.value;
    const year = elements.yearFilter.value;
    const type = elements.typeFilter.value;
    const query = elements.search.value.trim().toLocaleLowerCase("zh-TW");
    return ledger.transactions.filter((item) => {
      const periodMatches = periodMode === "all" || (periodMode === "year" ? item.date.startsWith(`${year}-`) : item.date.startsWith(month));
      const searchable = `${item.category} ${item.note} ${accountName(item.accountId)} ${item.toAccountId ? accountName(item.toAccountId) : ""}`.toLocaleLowerCase("zh-TW");
      return periodMatches && (type === "all" || item.type === type) && (!query || searchable.includes(query));
    }).sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  function emptyBox(text) { const div = document.createElement("div"); div.className = "money-empty"; div.textContent = text; return div; }

  function refreshYearFilter() {
    const selected = elements.yearFilter.value || String(new Date().getFullYear());
    const years = [...new Set([String(new Date().getFullYear()), ...ledger.transactions.map((item) => item.date.slice(0, 4))])].filter((year) => /^\d{4}$/.test(year)).sort((a, b) => b.localeCompare(a));
    fillSelect(elements.yearFilter, years.map((year) => ({ value: year, label: `${year}年` })), years.includes(selected) ? selected : years[0]);
  }

  function updateRecentFilterVisibility() {
    const mode = elements.periodMode.value;
    elements.monthFilterLabel.hidden = mode !== "month";
    elements.yearFilterLabel.hidden = mode !== "year";
  }

  function resetRecentPagination() { visibleTransactionCount = RECENT_PAGE_SIZE; renderRecent(); }

  function renderRecent() {
    const items = filteredTransactions();
    const visibleItems = items.slice(0, visibleTransactionCount);
    elements.transactionCount.textContent = items.length > visibleItems.length ? `共 ${items.length} 筆，目前顯示 ${visibleItems.length} 筆` : `共 ${items.length} 筆`;
    elements.transactionList.replaceChildren(...(visibleItems.length ? visibleItems.map(renderTransactionCard) : [emptyBox("目前沒有符合條件的交易紀錄。")]));
    elements.transactionLoadMore.hidden = visibleItems.length >= items.length;
  }

  function signedMoney(value) { return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`; }

  function comparisonText(current, comparison) {
    const delta = current - comparison;
    if (!comparison) return `${signedMoney(delta)}（${current ? "比較期為0" : "持平"}）`;
    const percentage = Math.abs(delta / comparison * 100);
    return `${signedMoney(delta)}（${delta > 0 ? "+" : delta < 0 ? "−" : ""}${percentage.toFixed(1)}%）`;
  }

  function renderPeriodComparison(container, current, comparison) {
    const metrics = [["收入", "income"], ["支出", "expense"], ["淨現金流", "net"]];
    const rows = metrics.map(([label, key]) => {
      const delta = current[key] - comparison[key];
      const row = document.createElement("div"); row.className = "comparison-row";
      const name = document.createElement("span"); name.textContent = label;
      const values = document.createElement("div"); values.className = "comparison-values";
      const amount = document.createElement("strong"); amount.textContent = money(current[key]);
      const change = document.createElement("small"); change.textContent = comparisonText(current[key], comparison[key]);
      const favorable = key === "expense" ? delta < 0 : delta > 0;
      const unfavorable = key === "expense" ? delta > 0 : delta < 0;
      if (favorable) change.className = "better"; else if (unfavorable) change.className = "worse";
      values.append(amount, change); row.append(name, values); return row;
    });
    container.replaceChildren(...rows);
  }

  function renderMonthly() {
    const selectedMonth = elements.summaryMonth.value || currentMonth();
    const totals = totalsForMonth(selectedMonth);
    elements.summaryIncome.textContent = money(totals.income); elements.summaryExpense.textContent = money(totals.expense); elements.summaryNet.textContent = money(totals.net); elements.summaryCount.textContent = String(totals.items.length);
    const previousKey = shiftMonthKey(selectedMonth, -1); const priorYearKey = shiftMonthKey(selectedMonth, -12);
    elements.previousComparisonTitle.textContent = `與 ${previousKey.replace("-", "年")}月比較`;
    elements.priorYearComparisonTitle.textContent = `與 ${priorYearKey.replace("-", "年")}月比較`;
    renderPeriodComparison(elements.previousComparison, totals, totalsForMonth(previousKey));
    renderPeriodComparison(elements.priorYearComparison, totals, totalsForMonth(priorYearKey));
    const grouped = new Map();
    totals.items.filter((item) => item.type !== "transfer").forEach((item) => grouped.set(`${item.type}|${item.category}`, (grouped.get(`${item.type}|${item.category}`) || 0) + item.amount));
    const rows = [...grouped.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => {
      const [type, category] = key.split("|"); const row = document.createElement("div"); const label = document.createElement("span"); const amount = document.createElement("strong"); label.textContent = `${type === "income" ? "收入" : "支出"}｜${category}`; amount.textContent = money(value); row.append(label, amount); return row;
    });
    elements.monthlyCategories.replaceChildren(...(rows.length ? rows : [emptyBox("這個月還沒有收支紀錄。")]));
  }

  function renderCashflow() {
    const grouped = new Map();
    ledger.transactions.filter((item) => item.type !== "transfer").forEach((item) => {
      const current = grouped.get(item.date) || { income: 0, expense: 0 };
      current[item.type] += item.amount; grouped.set(item.date, current);
    });
    const rows = [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 90).map(([date, values]) => {
      const row = document.createElement("tr"); [date, money(values.income), money(values.expense), money(values.income - values.expense)].forEach((text) => { const cell = document.createElement("td"); cell.textContent = text; row.append(cell); }); return row;
    });
    if (!rows.length) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 4; cell.textContent = "目前沒有現金流紀錄。"; row.append(cell); rows.push(row); }
    elements.cashflowBody.replaceChildren(...rows);
  }

  function renderBars(container, entries, emptyText) {
    if (!entries.length) { container.replaceChildren(emptyBox(emptyText)); return; }
    const maximum = Math.max(...entries.map(([, value]) => Math.abs(value)), 1);
    const rows = entries.map(([label, value]) => {
      const row = document.createElement("div"); row.className = "bar-row";
      const heading = document.createElement("div"); const name = document.createElement("span"); name.textContent = label; const amount = document.createElement("strong"); amount.textContent = money(value); heading.append(name, amount);
      const track = document.createElement("div"); track.className = "bar-track"; const bar = document.createElement("i"); bar.style.width = `${Math.max(2, Math.abs(value) / maximum * 100)}%`; track.append(bar); row.append(heading, track); return row;
    });
    container.replaceChildren(...rows);
  }

  function renderCharts() {
    const totals = totalsForMonth(currentMonth()); const categories = new Map();
    totals.items.filter((item) => item.type === "expense").forEach((item) => categories.set(item.category, (categories.get(item.category) || 0) + item.amount));
    renderBars(elements.expenseChart, [...categories.entries()].sort((a, b) => b[1] - a[1]), "本月尚無支出資料。");
    renderBars(elements.balanceChart, ledger.accounts.map((account) => [account.name, accountBalance(account.id)]).sort((a, b) => b[1] - a[1]), "尚未建立帳戶。");
  }

  function renderTrends() {
    const now = new Date();
    const showPriorYear = elements.trendPriorYear.checked;
    const months = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = monthKey(date);
      const totals = totalsForMonth(key);
      const prior = totalsForMonth(shiftMonthKey(key, -12));
      months.push({ key, label: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`, income: totals.income, expense: totals.expense, priorIncome: prior.income, priorExpense: prior.expense });
    }
    const maximum = Math.max(...months.flatMap((item) => showPriorYear ? [item.income, item.expense, item.priorIncome, item.priorExpense] : [item.income, item.expense]), 1);
    const rows = months.map((item) => {
      const row = document.createElement("div"); row.className = "trend-row";
      const label = document.createElement("span"); label.textContent = item.label;
      const bars = document.createElement("div"); bars.className = "trend-bars";
      const income = document.createElement("i"); income.className = "income"; income.style.width = `${Math.max(item.income ? 2 : 0, item.income / maximum * 100)}%`; income.title = `收入 ${money(item.income)}`;
      const expense = document.createElement("i"); expense.className = "expense"; expense.style.width = `${Math.max(item.expense ? 2 : 0, item.expense / maximum * 100)}%`; expense.title = `支出 ${money(item.expense)}`;
      bars.append(income, expense);
      if (showPriorYear) {
        const priorIncome = document.createElement("i"); priorIncome.className = "prior-income"; priorIncome.style.width = `${Math.max(item.priorIncome ? 2 : 0, item.priorIncome / maximum * 100)}%`; priorIncome.title = `去年收入 ${money(item.priorIncome)}`;
        const priorExpense = document.createElement("i"); priorExpense.className = "prior-expense"; priorExpense.style.width = `${Math.max(item.priorExpense ? 2 : 0, item.priorExpense / maximum * 100)}%`; priorExpense.title = `去年支出 ${money(item.priorExpense)}`;
        bars.append(priorIncome, priorExpense);
      }
      const values = document.createElement("div"); values.className = "trend-values";
      const current = document.createElement("strong"); current.textContent = `本期：收 ${money(item.income)}｜支 ${money(item.expense)}`; values.append(current);
      if (showPriorYear) { const prior = document.createElement("small"); prior.textContent = `去年：收 ${money(item.priorIncome)}｜支 ${money(item.priorExpense)}`; values.append(prior); }
      row.append(label, bars, values); return row;
    });
    elements.trendChart.replaceChildren(...rows);

    const currentTotals = months.reduce((sum, item) => ({ income: sum.income + item.income, expense: sum.expense + item.expense }), { income: 0, expense: 0 });
    currentTotals.net = currentTotals.income - currentTotals.expense;
    const priorTotals = months.reduce((sum, item) => ({ income: sum.income + item.priorIncome, expense: sum.expense + item.priorExpense }), { income: 0, expense: 0 });
    priorTotals.net = priorTotals.income - priorTotals.expense;
    const summaryRows = [["近12月收入", "income"], ["近12月支出", "expense"], ["近12月淨額", "net"]].map(([label, key]) => {
      const card = document.createElement("div"); const name = document.createElement("span"); const amount = document.createElement("strong"); const comparison = document.createElement("small");
      name.textContent = label; amount.textContent = money(currentTotals[key]); comparison.textContent = showPriorYear ? `較去年同期 ${comparisonText(currentTotals[key], priorTotals[key])}` : "去年同期比較已隱藏";
      card.append(name, amount, comparison); return card;
    });
    elements.trendSummary.replaceChildren(...summaryRows);
  }

  function renderAccounts() {
    elements.accountList.replaceChildren(...ledger.accounts.map((account) => {
      const row = document.createElement("div"); const text = document.createElement("span"); text.textContent = `${account.name}｜期初 ${money(account.openingBalance)}｜目前 ${money(accountBalance(account.id))}`;
      const button = document.createElement("button"); button.type = "button"; button.textContent = "刪除"; button.disabled = ledger.accounts.length <= 1; button.addEventListener("click", () => deleteAccount(account.id)); row.append(text, button); return row;
    }));
    const custom = [
      ...ledger.categories.expense.filter((item) => !DEFAULT_EXPENSE_CATEGORIES.includes(item)).map((item) => ["expense", item]),
      ...ledger.categories.income.filter((item) => !DEFAULT_INCOME_CATEGORIES.includes(item)).map((item) => ["income", item])
    ];
    elements.customCategories.replaceChildren(...(custom.length ? custom.map(([type, category]) => {
      const row = document.createElement("div"); const text = document.createElement("span"); text.textContent = `${type === "income" ? "收入" : "支出"}｜${category}`; const button = document.createElement("button"); button.type = "button"; button.textContent = "刪除"; button.addEventListener("click", () => deleteCategory(type, category)); row.append(text, button); return row;
    }) : [emptyBox("目前沒有自訂分類。")]));
  }

  function renderAccounting() {
    const totals = totalsForMonth(currentMonth()); elements.income.textContent = money(totals.income); elements.expense.textContent = money(totals.expense); elements.net.textContent = money(totals.net);
    refreshEntryFields(); refreshYearFilter(); updateRecentFilterVisibility(); renderRecent(); renderMonthly(); renderCashflow(); renderCharts(); renderTrends(); renderAccounts(); renderPlanningDashboard(); renderInstallments();
  }

  function editTransaction(id) {
    const transaction = ledger.transactions.find((item) => item.id === id); if (!transaction) return;
    const amount = window.prompt("修改金額：", String(transaction.amount)); if (amount === null) return;
    const note = window.prompt("修改備註：", transaction.note); if (note === null) return;
    const date = window.prompt("修改日期（YYYY-MM-DD）：", transaction.date); if (date === null) return;
    if (!Number(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert("金額或日期格式不正確。"); return; }
    const before = { ...transaction }; transaction.amount = Math.round(Math.abs(Number(amount))); transaction.note = cleanText(note); transaction.date = date; transaction.updatedAt = new Date().toISOString(); transaction.fingerprint = fingerprint(transaction);
    if (!saveLedger()) Object.assign(transaction, before); renderAccounting();
  }

  function deleteTransaction(id) {
    const index = ledger.transactions.findIndex((item) => item.id === id); if (index < 0) return;
    deletedTransaction = { item: ledger.transactions[index], index }; ledger.transactions.splice(index, 1);
    if (!saveLedger()) { ledger.transactions.splice(index, 0, deletedTransaction.item); return; }
    showUndo(); renderAccounting();
  }

  function showUndo() {
    let toast = $("#money-undo-toast");
    if (!toast) { toast = document.createElement("div"); toast.id = "money-undo-toast"; toast.className = "money-undo-toast"; const text = document.createElement("span"); text.textContent = "交易已刪除"; const button = document.createElement("button"); button.type = "button"; button.textContent = "復原"; button.addEventListener("click", undoDelete); toast.append(text, button); document.body.append(toast); }
    toast.hidden = false; clearTimeout(undoTimer); undoTimer = window.setTimeout(() => { toast.hidden = true; deletedTransaction = null; }, 8000);
  }

  function undoDelete() {
    if (!deletedTransaction) return; ledger.transactions.splice(deletedTransaction.index, 0, deletedTransaction.item); saveLedger(); deletedTransaction = null; $("#money-undo-toast").hidden = true; renderAccounting();
  }

  function deleteAccount(id) {
    if (ledger.transactions.some((item) => item.accountId === id || item.toAccountId === id)) { alert("這個帳戶已有交易紀錄，為避免帳務錯誤，無法直接刪除。"); return; }
    if (!window.confirm("確定刪除這個帳戶？")) return; ledger.accounts = ledger.accounts.filter((item) => item.id !== id); saveLedger(); renderAccounting();
  }

  function deleteCategory(type, category) {
    if (ledger.transactions.some((item) => item.type === type && item.category === category)) { alert("這個分類已有交易紀錄，無法刪除。"); return; }
    ledger.categories[type] = ledger.categories[type].filter((item) => item !== category); saveLedger(); renderAccounting();
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function spreadsheetSafeText(value) {
    const text = String(value ?? "");
    return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  }

  function csvCell(value) { return `"${spreadsheetSafeText(value).replace(/"/g, '""')}"`; }

  function accountingRows() {
    return [["日期", "類型", "分類", "金額", "帳戶", "轉入帳戶", "備註", "本機識別碼"], ...ledger.transactions.map((item) => [item.date, TYPE_LABEL[item.type], item.category, item.amount, accountName(item.accountId), item.toAccountId ? accountName(item.toAccountId) : "", item.note, item.fingerprint])];
  }

  async function exportJson() {
    await saveSequence;
    const vault = readVault();
    if (!vault) { alert("找不到加密保險庫，請重新解鎖後再試。"); return; }
    download(`EliNotebook-finance-encrypted-${localDateKey()}.json`, JSON.stringify(vault, null, 2), "application/json;charset=utf-8");
  }

  function loadSpreadsheetLibrary() {
    if (window.XLSX?.version === "0.20.3") return Promise.resolve(window.XLSX);
    if (spreadsheetLibraryPromise) return spreadsheetLibraryPromise;
    spreadsheetLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => reject(new Error("試算表元件載入逾時")), 20000);
      script.src = new URL("./vendor/sheetjs/xlsx.full.min.js", window.location.href).href;
      script.addEventListener("load", () => { window.clearTimeout(timeout); if (window.XLSX?.version === "0.20.3") resolve(window.XLSX); else reject(new Error("試算表元件版本不正確")); }, { once: true });
      script.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("試算表元件載入失敗")); }, { once: true });
      document.head.append(script);
    }).catch((error) => { spreadsheetLibraryPromise = null; throw error; });
    return spreadsheetLibraryPromise;
  }

  async function exportXlsx() {
    if (!confirm("Excel檔沒有加密，請勿上傳公開雲端或分享給他人。確定下載？")) return;
    elements.exportXlsx.disabled = true;
    try {
      const XLSX = await loadSpreadsheetLibrary();
      const rows = accountingRows().map((row, rowIndex) => row.map((value, columnIndex) => rowIndex && columnIndex !== 3 ? spreadsheetSafeText(value) : value));
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
      sheet["!cols"] = [{ wch: 12 }, { wch: 9 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 18 }, { wch: 34 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(workbook, sheet, "帳務紀錄");
      const installmentRows = [["分期名稱", "總額", "總期數", "已繳期數", "剩餘金額", "第一期月份", "每月繳款日", "下一期日期", "下一期金額"], ...planningDashboard().installments.map((item) => [spreadsheetSafeText(item.name), item.totalAmount, item.installmentCount, item.paidCount, item.remainingAmount, item.firstDueMonth, item.dueDay, item.nextPayment?.dueDateKey || "已完成", item.nextPayment?.amount || 0])];
      const installmentSheet = XLSX.utils.aoa_to_sheet(installmentRows); installmentSheet["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(workbook, installmentSheet, "分期狀態");
      const settingSheet = XLSX.utils.aoa_to_sheet([["設定", "數值"], ["每月發薪日", ledger.planning.salaryDay || "未設定"], ["預留不可動用金額", ledger.planning.reserveAmount], ["可用資金扣除發薪日前分期", ledger.planning.includeInstallments ? "是" : "否"]]);
      settingSheet["!cols"] = [{ wch: 32 }, { wch: 18 }]; XLSX.utils.book_append_sheet(workbook, settingSheet, "資金設定");
      const notice = XLSX.utils.aoa_to_sheet([["EliNotebook私人財務中心"], ["此Excel檔未加密，請妥善保存。"], ["重新匯入時只會讀取第一個工作表「帳務紀錄」的純值，不執行公式或巨集。"], ["分期狀態與資金設定僅供閱讀；完整還原請使用加密JSON備份。"], ["欄位：日期、類型、分類、金額、帳戶、轉入帳戶、備註。"]]);
      notice["!cols"] = [{ wch: 72 }]; XLSX.utils.book_append_sheet(workbook, notice, "使用說明");
      XLSX.writeFile(workbook, `EliNotebook-accounting-${localDateKey()}.xlsx`, { bookType: "xlsx", compression: true });
    } catch (error) {
      console.error("Excel匯出失敗：", error); alert("無法建立Excel檔，請改用CSV下載。");
    } finally { elements.exportXlsx.disabled = false; }
  }

  function exportCsv() {
    if (!confirm("CSV沒有加密，請勿分享給他人。確定匯出？")) return;
    const rows = accountingRows();
    download(`EliNotebook-accounting-${localDateKey()}.csv`, `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
  }

  function parseCsv(text) {
    const rows = []; let row = [], cell = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) { const character = text[index]; if (quoted && character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = !quoted; else if (character === "," && !quoted) { row.push(cell); cell = ""; } else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ""; } else cell += character; }
    row.push(cell); if (row.some((value) => value.trim())) rows.push(row); return rows;
  }

  const IMPORT_HEADER_ALIASES = {
    date: ["日期", "交易日期", "date", "transactiondate"], type: ["類型", "收支類型", "type", "transactiontype"],
    category: ["分類", "category"], amount: ["金額", "amount", "value"], account: ["帳戶", "付款帳戶", "來源帳戶", "account", "sourceaccount"],
    toAccount: ["轉入帳戶", "目標帳戶", "toaccount", "destinationaccount", "targetaccount"], note: ["備註", "說明", "摘要", "note", "memo", "description"]
  };

  function normalizedHeader(value) { return String(value ?? "").normalize("NFKC").replace(/^\uFEFF/, "").trim().toLocaleLowerCase("zh-TW").replace(/[\s_\-（）()]/g, ""); }

  function findImportHeader(rows) {
    const aliases = Object.fromEntries(Object.entries(IMPORT_HEADER_ALIASES).map(([key, values]) => [key, new Set(values.map(normalizedHeader))]));
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
      const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : []; const columns = {};
      row.slice(0, MAX_IMPORT_COLUMNS).forEach((value, columnIndex) => {
        const header = normalizedHeader(value); Object.entries(aliases).forEach(([key, values]) => { if (columns[key] === undefined && values.has(header)) columns[key] = columnIndex; });
      });
      if (["date", "type", "amount", "account"].every((key) => columns[key] !== undefined)) return { rowIndex, columns };
    }
    throw new Error("找不到必要欄位：日期、類型、金額、帳戶");
  }

  function importedText(value) {
    if (value && typeof value === "object" && typeof value.__eliDate === "string") return value.__eliDate;
    return String(value ?? "").normalize("NFKC").trim();
  }

  function importedDate(value) {
    if (value && typeof value === "object" && isValidDateKey(value.__eliDate)) return value.__eliDate;
    if (typeof value === "number" && value > 0 && value < 2958466) {
      const date = new Date(Math.round((value - 25569) * 86400000)); const key = date.toISOString().slice(0, 10); return isValidDateKey(key) ? key : "";
    }
    const text = importedText(value).replace(/[年/.]/g, "-").replace(/月/g, "-").replace(/日/g, "");
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(text);
    if (!match) return "";
    const key = `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    return isValidDateKey(key) ? key : "";
  }

  function importedAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(Math.abs(value)) : 0;
    const text = importedText(value).replace(/[(),，\s]/g, "").replace(/^(?:NT\$|TWD|\$|＄)/i, "");
    const number = Number(text); return Number.isFinite(number) ? Math.round(Math.abs(number)) : 0;
  }

  function importedType(value) {
    const text = normalizedHeader(value);
    if (["收入", "income", "in"].includes(text)) return "income";
    if (["支出", "expense", "out"].includes(text)) return "expense";
    if (["轉移", "轉帳", "transfer"].includes(text)) return "transfer";
    return "";
  }

  function prepareRowsForImport(rows, source) {
    const { rowIndex: headerRowIndex, columns } = findImportHeader(rows);
    const stagedAccounts = ledger.accounts.map((account) => ({ ...account })); const newAccounts = [];
    const stagedCategories = { expense: [...ledger.categories.expense], income: [...ledger.categories.income] }; const newCategories = [];
    const accountByName = new Map(stagedAccounts.map((account) => [account.name.toLocaleLowerCase("zh-TW"), account.id]));
    const seenFingerprints = new Set(ledger.transactions.map((item) => item.fingerprint));
    const transactions = []; const errors = []; let duplicateCount = 0;
    const addError = (line, reason) => errors.push(`第${line}列：${reason}`);
    const resolveAccount = (rawName, line) => {
      const fullName = importedText(rawName); const name = cleanText(fullName, 30);
      if (!name) { addError(line, "帳戶名稱空白"); return ""; }
      if (fullName.length > 30) { addError(line, "帳戶名稱超過30字"); return ""; }
      const key = name.toLocaleLowerCase("zh-TW"); if (accountByName.has(key)) return accountByName.get(key);
      if (newAccounts.length >= MAX_IMPORTED_ACCOUNTS) { addError(line, "新帳戶超過100個上限"); return ""; }
      const account = { id: createId("account"), name, openingBalance: 0 }; stagedAccounts.push(account); newAccounts.push(account); accountByName.set(key, account.id); return account.id;
    };

    rows.slice(headerRowIndex + 1).forEach((row, offset) => {
      const line = headerRowIndex + offset + 2; if (!Array.isArray(row) || !row.some((cell) => importedText(cell))) return;
      const type = importedType(row[columns.type]); const date = importedDate(row[columns.date]); const amount = importedAmount(row[columns.amount]);
      if (!type) { addError(line, "類型必須是收入、支出或轉移"); return; }
      if (!date) { addError(line, "日期格式無效，請使用YYYY-MM-DD"); return; }
      if (!amount || amount > 999999999999) { addError(line, "金額必須大於0且不可超過999,999,999,999"); return; }
      const accountId = resolveAccount(row[columns.account], line); if (!accountId) return;
      const toAccountId = type === "transfer" ? resolveAccount(row[columns.toAccount], line) : "";
      if (type === "transfer" && (!toAccountId || toAccountId === accountId)) { addError(line, "轉移需要不同的來源與轉入帳戶"); return; }
      const categoryText = columns.category === undefined ? "" : importedText(row[columns.category]);
      if (categoryText.length > 20) { addError(line, "分類名稱超過20字"); return; }
      const category = type === "transfer" ? "帳戶轉移" : categoryText || (type === "income" ? "其他收入" : "其他支出");
      if (type !== "transfer" && !stagedCategories[type].includes(category)) {
        if (newCategories.length >= MAX_IMPORTED_CATEGORIES) { addError(line, "新分類超過200個上限"); return; }
        stagedCategories[type].push(category); newCategories.push([type, category]);
      }
      const noteText = columns.note === undefined ? "" : importedText(row[columns.note]);
      if (noteText.length > 100) { addError(line, "備註超過100字"); return; }
      const transaction = normalizeTransaction({ type, date, amount, category, accountId, toAccountId, note: noteText, id: createId("transaction"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, stagedAccounts[0].id, new Set(stagedAccounts.map((account) => account.id)));
      if (!transaction) { addError(line, "資料無法轉換為有效交易"); return; }
      if (seenFingerprints.has(transaction.fingerprint)) { duplicateCount += 1; return; }
      if (ledger.transactions.length + transactions.length >= MAX_TRANSACTIONS) { addError(line, "加入後會超過10,000筆上限"); return; }
      seenFingerprints.add(transaction.fingerprint); transactions.push(transaction);
    });
    // 只有被「有效且準備匯入」交易實際使用的帳戶與分類才會保留。
    // 特性：若某列最後因備註過長、重複或筆數上限而被拒絕，不會留下空的分類或帳戶。
    const usedAccountIds = new Set(transactions.flatMap((item) => [item.accountId, item.toAccountId]).filter(Boolean));
    const usedCategories = new Set(transactions.filter((item) => item.type !== "transfer").map((item) => `${item.type}\u0000${item.category}`));
    const usedNewAccounts = newAccounts.filter((account) => usedAccountIds.has(account.id));
    const usedNewCategories = newCategories.filter(([type, category]) => usedCategories.has(`${type}\u0000${category}`));
    return { source, revision: ledgerRevision, transactions, errors, duplicateCount, newAccounts: usedNewAccounts, newCategories: usedNewCategories };
  }

  function ledgerToImportRows(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.transactions) || !Array.isArray(value.accounts)) throw new Error("JSON不是帳務資料格式");
    const normalized = normalizeLedger(value); const importedAccountName = (id) => normalized.accounts.find((account) => account.id === id)?.name || "";
    return [["日期", "類型", "分類", "金額", "帳戶", "轉入帳戶", "備註"], ...normalized.transactions.map((item) => [item.date, TYPE_LABEL[item.type], item.category, item.amount, importedAccountName(item.accountId), item.toAccountId ? importedAccountName(item.toAccountId) : "", item.note])];
  }

  function clearImportPreview() {
    pendingImport = null;
    if (elements.importPreview) elements.importPreview.hidden = true;
    if (elements.importSummary) elements.importSummary.textContent = "";
    if (elements.importErrors) elements.importErrors.replaceChildren();
    if (elements.importConfirm) elements.importConfirm.disabled = false;
  }

  function showImportPreview(result) {
    pendingImport = result;
    const accountNames = result.newAccounts.map((account) => account.name);
    const categoryNames = result.newCategories.map(([type, name]) => `${type === "income" ? "收入" : "支出"}：${name}`);
    elements.importSummary.textContent = `${result.source}｜可合併 ${result.transactions.length} 筆｜重複略過 ${result.duplicateCount} 筆｜錯誤 ${result.errors.length} 筆｜新增帳戶 ${accountNames.length} 個｜新增分類 ${categoryNames.length} 個。${accountNames.length ? ` 新帳戶：${accountNames.slice(0, 8).join("、")}${accountNames.length > 8 ? "……" : ""}。` : ""}${categoryNames.length ? ` 新分類：${categoryNames.slice(0, 8).join("、")}${categoryNames.length > 8 ? "……" : ""}。` : ""}`;
    const errorRows = result.errors.slice(0, 10).map((message) => { const row = document.createElement("p"); row.textContent = message; return row; });
    if (result.errors.length > 10) { const more = document.createElement("p"); more.textContent = `另有 ${result.errors.length - 10} 筆錯誤未顯示；這些資料都不會寫入。`; errorRows.push(more); }
    elements.importErrors.replaceChildren(...errorRows);
    elements.importConfirm.disabled = !result.transactions.length;
    elements.importPreview.hidden = false;
    elements.importPreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function parseSpreadsheetFile(file) {
    return new Promise(async (resolve, reject) => {
      if (!window.Worker) { reject(new Error("瀏覽器不支援安全試算表工作執行緒")); return; }
      let buffer;
      try { buffer = await file.arrayBuffer(); } catch (_error) { reject(new Error("無法讀取檔案")); return; }
      const extension = file.name.split(".").pop().toLowerCase(); const signature = [...new Uint8Array(buffer.slice(0, 4))];
      const zip = signature[0] === 0x50 && signature[1] === 0x4b; const cfb = signature[0] === 0xd0 && signature[1] === 0xcf && signature[2] === 0x11 && signature[3] === 0xe0;
      if ((["xlsx", "numbers"].includes(extension) && !zip) || (extension === "xls" && !cfb)) { reject(new Error("副檔名與實際檔案格式不符")); return; }
      const worker = new Worker(new URL("./javascript/spreadsheet-import-worker.js", window.location.href)); activeImportWorker = worker;
      const timer = window.setTimeout(() => { worker.terminate(); if (activeImportWorker === worker) activeImportWorker = null; reject(new Error("試算表解析超過30秒，已安全停止")); }, 30000);
      worker.addEventListener("message", (event) => {
        window.clearTimeout(timer); worker.terminate(); if (activeImportWorker === worker) activeImportWorker = null;
        if (!event.data?.ok) { reject(new Error(event.data?.message || "無法解析試算表")); return; }
        if (event.data.truncated) { reject(new Error("工作表超過10,000筆上限")); return; }
        if (event.data.columnOverflow) { reject(new Error("工作表超過40欄上限")); return; }
        resolve({ rows: event.data.rows, sheetName: event.data.sheetName, sheetCount: event.data.sheetCount });
      }, { once: true });
      worker.addEventListener("error", () => { window.clearTimeout(timer); worker.terminate(); if (activeImportWorker === worker) activeImportWorker = null; reject(new Error("試算表解析失敗")); }, { once: true });
      worker.postMessage({ action: "parse-spreadsheet", buffer }, [buffer]);
    });
  }

  async function confirmPendingImport() {
    const imported = pendingImport; if (!imported?.transactions.length) return;
    if (imported.revision !== ledgerRevision) { alert("預覽後帳務已有變更。為避免合併到錯誤版本，請重新選擇檔案。"); clearImportPreview(); return; }
    if (!window.confirm(`確定把 ${imported.transactions.length} 筆不重複紀錄合併到目前加密保險庫？現有紀錄不會被刪除。`)) return;
    const previous = JSON.parse(JSON.stringify(ledger));
    ledger.accounts.push(...imported.newAccounts);
    imported.newCategories.forEach(([type, category]) => { if (!ledger.categories[type].includes(category)) ledger.categories[type].push(category); });
    ledger.transactions = [...imported.transactions, ...ledger.transactions].sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (!saveLedger()) { ledger = previous; return; }
    elements.importConfirm.disabled = true; await saveSequence; clearImportPreview(); renderAccounting();
    alert(`匯入完成：已安全合併 ${imported.transactions.length} 筆，略過 ${imported.duplicateCount} 筆重複紀錄；${imported.errors.length} 筆錯誤資料未寫入。`);
  }

  async function importAccounting(event) {
    const file = event.target.files?.[0]; if (!file) return;
    clearImportPreview();
    if (file.size > MAX_IMPORT_FILE_BYTES) { alert("檔案超過5MB，已安全停止匯入。"); event.target.value = ""; return; }
    if (!file.size) { alert("檔案是空的，無法匯入。"); event.target.value = ""; return; }
    const extension = file.name.split(".").pop().toLowerCase();
    if (!['json', 'csv', 'xlsx', 'xls', 'numbers'].includes(extension)) { alert("只支援JSON、CSV、Excel（.xlsx／.xls）或Numbers檔案。"); event.target.value = ""; return; }
    elements.importFile.disabled = true; elements.importSummary.textContent = "正在目前裝置分析檔案，不會上傳……"; elements.importPreview.hidden = false;
    try {
      let rows; let source = `${cleanText(file.name, 120)}（本機檔案）`;
      if (extension === "json") {
        const parsed = JSON.parse(await file.text());
        if (parsed?.version === 2) {
          if (!isValidVault(parsed)) throw new Error("加密備份格式或安全參數不正確");
          if (!window.confirm("這是加密完整備份，匯入後會取代目前保險庫。系統會先下載目前的加密備份；確定繼續？")) { clearImportPreview(); return; }
          await saveSequence; const currentVault = readVault(); if (currentVault) download(`EliNotebook-finance-before-restore-${localDateKey()}.json`, JSON.stringify(currentVault, null, 2), "application/json;charset=utf-8");
          vaultGeneration += 1; localStorage.setItem(VAULT_KEY, JSON.stringify(parsed)); localStorage.removeItem(LEGACY_STORAGE_KEY); localStorage.removeItem(LEGACY_AUTH_KEY); financeUnlocked = true; lockFinance("加密備份已匯入，請輸入該備份原本的財務密碼。"); return;
        }
        rows = ledgerToImportRows(parsed);
      } else if (extension === "csv") rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
      else {
        const parsed = await parseSpreadsheetFile(file); rows = parsed.rows; source = `${cleanText(file.name, 120)}｜第一工作表：${cleanText(parsed.sheetName, 100)}｜共${parsed.sheetCount}個工作表`;
      }
      showImportPreview(prepareRowsForImport(rows, source));
    } catch (error) {
      console.error("帳務匯入失敗：", error); clearImportPreview(); alert(`無法匯入：${error instanceof Error ? error.message : "檔案格式不正確"}。檔案內容沒有寫入。`);
    } finally { elements.importFile.disabled = false; event.target.value = ""; }
  }

  elements.authForm.addEventListener("submit", handleFinanceAuth);
  elements.forgotPin.addEventListener("click", forgetFinancePin);
  elements.financeLock.addEventListener("click", () => lockFinance("你已手動上鎖，加密金鑰已從記憶體移除。"));
  elements.tabs.forEach((button) => button.addEventListener("click", () => {
    elements.tabs.forEach((item) => { const active = item === button; item.classList.toggle("active", active); if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); });
    elements.panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.accountingPanel === button.dataset.accountingTab));
  }));
  elements.naturalForm.addEventListener("submit", (event) => { event.preventDefault(); const parsed = parseNatural(elements.naturalInput.value.trim()); if (!parsed) { elements.naturalFeedback.textContent = "找不到金額，請輸入例如：午餐120現金。"; return; } if (parsed.type === "transfer" && !parsed.toAccountId) { elements.naturalFeedback.textContent = "帳戶轉移請同時寫出兩個帳戶名稱，或使用按鈕式記帳。"; return; } if (addTransaction(parsed, elements.naturalFeedback)) elements.naturalForm.reset(); });
  elements.fixedForm.addEventListener("submit", (event) => { event.preventDefault(); const parsed = parseFixed(elements.fixedInput.value.trim()); if (!parsed) { elements.fixedFeedback.textContent = "格式不正確，請依照範例輸入。"; return; } if (addTransaction(parsed, elements.fixedFeedback)) elements.fixedForm.reset(); });
  elements.typeButtons.forEach((button) => button.addEventListener("click", () => { elements.type.value = button.dataset.moneyType; elements.typeButtons.forEach((item) => item.classList.toggle("active", item === button)); refreshEntryFields(); }));
  elements.account.addEventListener("change", refreshEntryFields);
  elements.buttonForm.addEventListener("submit", (event) => { event.preventDefault(); const added = addTransaction({ type: elements.type.value, amount: elements.amount.value, category: elements.category.value, accountId: elements.account.value, toAccountId: elements.toAccount.value, date: elements.date.value, note: elements.note.value }); if (added) { elements.amount.value = ""; elements.note.value = ""; elements.date.value = localDateKey(); } });
  elements.periodMode.addEventListener("change", () => { updateRecentFilterVisibility(); resetRecentPagination(); });
  [elements.monthFilter, elements.yearFilter, elements.typeFilter, elements.search].forEach((control) => control.addEventListener("input", resetRecentPagination));
  elements.transactionLoadMore.addEventListener("click", () => { visibleTransactionCount += RECENT_PAGE_SIZE; renderRecent(); });
  elements.summaryMonth.addEventListener("change", renderMonthly);
  function moveMonth(offset) { elements.summaryMonth.value = shiftMonthKey(elements.summaryMonth.value, offset); renderMonthly(); }
  elements.previousMonth.addEventListener("click", () => moveMonth(-1)); elements.nextMonth.addEventListener("click", () => moveMonth(1));
  elements.trendPriorYear.addEventListener("change", renderTrends);
  elements.planningForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const salaryDay = Number(elements.salaryDay.value);
    const reserveAmount = Number(elements.reserveAmount.value);
    if (!Number.isInteger(salaryDay) || salaryDay < 1 || salaryDay > 31 || !Number.isInteger(reserveAmount) || reserveAmount < 0 || reserveAmount > 999999999999) {
      elements.planningFeedback.textContent = "請輸入1～31日的發薪日，預留金需為0以上的整數金額。"; return;
    }
    const before = { ...ledger.planning };
    ledger.planning = FinanceCore.normalizePlanning({ salaryDay, reserveAmount, includeInstallments: elements.includeInstallments.checked });
    if (!saveLedger()) { ledger.planning = before; return; }
    renderAccounting(); elements.planningFeedback.textContent = "資金設定已加密儲存，儀表板已重新計算。";
  });
  elements.installmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (ledger.installments.length >= MAX_INSTALLMENTS) { elements.installmentFeedback.textContent = "分期計畫已達200項上限。"; return; }
    const totalAmount = Number(elements.installmentTotal.value);
    const installmentCount = Number(elements.installmentCount.value);
    const paidCount = Number(elements.installmentPaid.value);
    const dueDay = Number(elements.installmentDueDay.value);
    if (!Number.isInteger(totalAmount) || totalAmount < 1 || totalAmount > 999999999999 || !Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 360 || !Number.isInteger(paidCount) || paidCount < 0 || paidCount > installmentCount || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || !/^\d{4}-\d{2}$/.test(elements.installmentFirstMonth.value)) {
      elements.installmentFeedback.textContent = "請檢查總額、期數、已繳期數、第一期月份與繳款日。"; return;
    }
    const installment = FinanceCore.normalizeInstallment({
      id: createId("installment"), name: elements.installmentName.value, totalAmount, installmentCount, paidCount,
      firstDueMonth: elements.installmentFirstMonth.value, dueDay, createdAt: new Date().toISOString()
    });
    if (!installment) { elements.installmentFeedback.textContent = "分期名稱或金額不正確。"; return; }
    ledger.installments.push(installment);
    if (!saveLedger()) { ledger.installments.pop(); return; }
    elements.installmentForm.reset(); elements.installmentCount.value = "12"; elements.installmentPaid.value = "0"; elements.installmentDueDay.value = "1"; elements.installmentFirstMonth.value = currentMonth();
    renderAccounting(); elements.installmentFeedback.textContent = `已新增「${installment.name}」，資料已寫入加密保險庫。`;
  });
  elements.accountForm.addEventListener("submit", (event) => { event.preventDefault(); const name = cleanText(elements.accountName.value, 30); if (ledger.accounts.some((item) => item.name === name)) { alert("帳戶名稱已存在。"); return; } ledger.accounts.push({ id: createId("account"), name, openingBalance: safeNumber(elements.accountBalance.value) }); saveLedger(); elements.accountForm.reset(); elements.accountBalance.value = "0"; renderAccounting(); });
  elements.categoryForm.addEventListener("submit", (event) => { event.preventDefault(); const type = elements.categoryType.value; const name = cleanText(elements.categoryName.value, 20); if (ledger.categories[type].includes(name)) { alert("分類名稱已存在。"); return; } ledger.categories[type].push(name); saveLedger(); elements.categoryForm.reset(); renderAccounting(); });
  elements.exportJson.addEventListener("click", exportJson); elements.exportXlsx.addEventListener("click", exportXlsx); elements.exportCsv.addEventListener("click", exportCsv); elements.importFile.addEventListener("change", importAccounting);
  elements.importConfirm.addEventListener("click", confirmPendingImport); elements.importCancel.addEventListener("click", clearImportPreview);
  window.addEventListener("storage", (event) => {
    if (event.key === VAULT_KEY && financeUnlocked) lockFinance("加密保險庫已在其他分頁變更，請重新輸入財務密碼。");
  });
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view !== "accounting" && financeUnlocked) lockFinance("你已離開私人財務中心，加密金鑰已從記憶體移除。");
  }));
  document.addEventListener("visibilitychange", () => { if (document.hidden && financeUnlocked) lockFinance("你已離開分頁，私人財務中心已自動上鎖。"); });
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => document.addEventListener(eventName, () => { if (financeUnlocked) scheduleFinanceLock(); }, { passive: true }));

  elements.date.value = localDateKey(); elements.monthFilter.value = currentMonth(); elements.summaryMonth.value = currentMonth(); elements.installmentFirstMonth.value = currentMonth(); renderAccounting(); initFinanceAuth();
});
