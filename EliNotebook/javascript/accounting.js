"use strict";

// EliNotebook 3.1 私人財務中心本機模組
// 所有帳務資料只存在目前瀏覽器的 localStorage，不會傳送到 GitHub 或任何伺服器。
window.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "eliNotebook.accounting.v1";
  const AUTH_KEY = "eliNotebook.financeAuth.v1";
  const AUTO_LOCK_DELAY = 5 * 60 * 1000;
  const MAX_TRANSACTIONS = 10000;
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
    monthFilter: $("#transaction-month"), typeFilter: $("#transaction-type-filter"), search: $("#transaction-search"),
    transactionList: $("#transaction-list"), transactionCount: $("#transaction-result-count"),
    summaryMonth: $("#summary-month"), previousMonth: $("#month-previous"), nextMonth: $("#month-next"),
    summaryIncome: $("#summary-income"), summaryExpense: $("#summary-expense"), summaryNet: $("#summary-net"), summaryCount: $("#summary-count"),
    monthlyCategories: $("#monthly-category-list"), cashflowBody: $("#cashflow-body"), expenseChart: $("#expense-chart"), balanceChart: $("#balance-chart"), trendChart: $("#trend-chart"),
    accountForm: $("#account-form"), accountName: $("#account-name"), accountBalance: $("#account-balance"), accountList: $("#account-list"),
    categoryForm: $("#category-form"), categoryType: $("#category-type"), categoryName: $("#category-name"), customCategories: $("#custom-category-list"),
    exportJson: $("#money-export-json"), exportCsv: $("#money-export-csv"), importFile: $("#money-import-file")
  };

  let ledger = loadLedger();
  let deletedTransaction = null;
  let undoTimer = null;
  let financeUnlocked = false;
  let financeAuthMode = "unlock";
  let failedAttempts = 0;
  let blockedUntil = 0;
  let financeLockTimer = null;

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

  // PIN不會明文保存。這是本機畫面門鎖，並不會加密localStorage中的帳務資料。
  async function derivePinHash(pin, salt, iterations = 120000) {
    if (!window.crypto?.subtle) throw new Error("目前瀏覽器不支援安全PIN驗證功能");
    const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
    return bytesToBase64(new Uint8Array(bits));
  }

  function readAuthConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
      return parsed?.salt && parsed?.hash ? parsed : null;
    } catch (error) {
      console.warn("無法讀取財務中心PIN設定：", error);
      return null;
    }
  }

  function initFinanceAuth() {
    const configured = Boolean(readAuthConfig());
    financeAuthMode = configured ? "unlock" : "setup";
    elements.financeAuth.hidden = false;
    elements.financeContent.hidden = true;
    elements.pinConfirmLabel.hidden = configured;
    elements.pinConfirm.required = !configured;
    elements.authSubmit.textContent = configured ? "驗證並開啟" : "設定PIN並開啟";
    elements.authDescription.textContent = configured
      ? "請先驗證本機PIN，才會顯示財務資料。"
      : "第一次使用，請設定6–12位數字PIN。PIN只保存在目前瀏覽器。";
    elements.forgotPin.hidden = !configured;
    elements.authFeedback.textContent = "";
    window.setTimeout(() => elements.pin.focus(), 0);
  }

  function unlockFinance() {
    financeUnlocked = true;
    failedAttempts = 0;
    elements.financeAuth.hidden = true;
    elements.financeContent.hidden = false;
    elements.authForm.reset();
    scheduleFinanceLock();
    renderAccounting();
  }

  function lockFinance(message = "私人財務中心已上鎖，請重新驗證。") {
    if (!financeUnlocked && elements.financeContent.hidden) return;
    financeUnlocked = false;
    window.clearTimeout(financeLockTimer);
    elements.financeContent.hidden = true;
    elements.financeAuth.hidden = false;
    elements.pinConfirmLabel.hidden = true;
    elements.pinConfirm.required = false;
    elements.authSubmit.textContent = "驗證並開啟";
    elements.authDescription.textContent = message;
    elements.authFeedback.textContent = "";
    elements.authForm.reset();
    window.setTimeout(() => elements.pin.focus(), 0);
  }

  function scheduleFinanceLock() {
    if (!financeUnlocked) return;
    window.clearTimeout(financeLockTimer);
    financeLockTimer = window.setTimeout(() => lockFinance("已閒置5分鐘，私人財務中心已自動上鎖。"), AUTO_LOCK_DELAY);
  }

  async function handleFinanceAuth(event) {
    event.preventDefault();
    const pin = elements.pin.value;
    if (!/^\d{6,12}$/.test(pin)) {
      elements.authFeedback.textContent = "PIN必須是6–12位數字。";
      return;
    }
    if (Date.now() < blockedUntil) {
      elements.authFeedback.textContent = `錯誤次數過多，請在${Math.ceil((blockedUntil - Date.now()) / 1000)}秒後再試。`;
      return;
    }
    elements.authSubmit.disabled = true;
    elements.authFeedback.textContent = "正在驗證……";
    try {
      if (financeAuthMode === "setup") {
        if (pin !== elements.pinConfirm.value) {
          elements.authFeedback.textContent = "兩次輸入的PIN不一致。";
          return;
        }
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iterations = 120000;
        const hash = await derivePinHash(pin, salt, iterations);
        localStorage.setItem(AUTH_KEY, JSON.stringify({ salt: bytesToBase64(salt), hash, iterations }));
        financeAuthMode = "unlock";
        elements.forgotPin.hidden = false;
        unlockFinance();
      } else {
        const config = readAuthConfig();
        if (!config) { initFinanceAuth(); return; }
        const hash = await derivePinHash(pin, base64ToBytes(config.salt), config.iterations || 120000);
        if (hash !== config.hash) {
          failedAttempts += 1;
          if (failedAttempts >= 5) { blockedUntil = Date.now() + 30000; failedAttempts = 0; }
          elements.authFeedback.textContent = blockedUntil > Date.now() ? "錯誤次數過多，已暫停驗證30秒。" : `PIN不正確，還可嘗試${5 - failedAttempts}次。`;
          elements.pin.select();
          return;
        }
        unlockFinance();
      }
    } catch (error) {
      console.error("PIN驗證失敗：", error);
      elements.authFeedback.textContent = "無法使用PIN驗證，請確認瀏覽器支援Web Crypto且網站使用HTTPS。";
    } finally {
      elements.authSubmit.disabled = false;
    }
  }

  function forgetFinancePin() {
    const first = window.confirm("忘記PIN無法復原。繼續會清除本機PIN及全部財務帳戶、分類和交易資料。是否繼續？");
    if (!first) return;
    const second = window.confirm("最後確認：確定永久清除目前瀏覽器內的全部財務資料？備忘錄不會受到影響。");
    if (!second) return;
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(STORAGE_KEY);
    ledger = defaultLedger();
    financeUnlocked = false;
    initFinanceAuth();
    renderAccounting();
  }

  function defaultLedger() {
    return {
      version: 1,
      accounts: [{ id: createId("account"), name: "現金", openingBalance: 0 }, { id: createId("account"), name: "銀行帳戶", openingBalance: 0 }],
      categories: { expense: [...DEFAULT_EXPENSE_CATEGORIES], income: [...DEFAULT_INCOME_CATEGORIES] },
      transactions: []
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
    return { version: 1, accounts, categories, transactions };
  }

  function normalizeTransaction(item, fallbackAccountId, accountIds = new Set()) {
    if (!item || typeof item !== "object") return null;
    const type = ["expense", "income", "transfer"].includes(item.type) ? item.type : "expense";
    const amount = Math.round(Math.abs(safeNumber(item.amount)));
    if (!amount) return null;
    const accountId = accountIds.has(item.accountId) ? item.accountId : fallbackAccountId;
    const toAccountId = type === "transfer" && accountIds.has(item.toAccountId) ? item.toAccountId : "";
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : localDateKey();
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

  function loadLedger() {
    try { return normalizeLedger(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); }
    catch (error) { console.error("無法讀取帳務資料：", error); return defaultLedger(); }
  }

  function saveLedger() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)); return true; }
    catch (error) { console.error("無法儲存帳務資料：", error); alert("帳務資料無法儲存。請確認瀏覽器允許網站資料，並避免使用無痕模式。"); return false; }
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
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "刪除"; remove.addEventListener("click", () => deleteTransaction(transaction.id));
    actions.append(edit, remove); card.append(main, amount, actions); return card;
  }

  function filteredTransactions() {
    const month = elements.monthFilter.value;
    const type = elements.typeFilter.value;
    const query = elements.search.value.trim().toLocaleLowerCase("zh-TW");
    return ledger.transactions.filter((item) => (!month || item.date.startsWith(month)) && (type === "all" || item.type === type) && (!query || `${item.category} ${item.note} ${accountName(item.accountId)}`.toLocaleLowerCase("zh-TW").includes(query))).sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  function emptyBox(text) { const div = document.createElement("div"); div.className = "money-empty"; div.textContent = text; return div; }

  function renderRecent() {
    const items = filteredTransactions(); elements.transactionCount.textContent = `共 ${items.length} 筆`;
    elements.transactionList.replaceChildren(...(items.length ? items.map(renderTransactionCard) : [emptyBox("目前沒有符合條件的交易紀錄。")]));
  }

  function renderMonthly() {
    const totals = totalsForMonth(elements.summaryMonth.value || currentMonth());
    elements.summaryIncome.textContent = money(totals.income); elements.summaryExpense.textContent = money(totals.expense); elements.summaryNet.textContent = money(totals.net); elements.summaryCount.textContent = String(totals.items.length);
    const grouped = new Map();
    totals.items.filter((item) => item.type !== "transfer").forEach((item) => grouped.set(`${item.type}|${item.category}`, (grouped.get(`${item.type}|${item.category}`) || 0) + item.amount));
    const rows = [...grouped.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => {
      const [type, category] = key.split("|"); const row = document.createElement("div"); row.innerHTML = `<span>${type === "income" ? "收入" : "支出"}｜${category}</span><strong>${money(value)}</strong>`; return row;
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
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const totals = totalsForMonth(key);
      months.push({ key, label: `${date.getMonth() + 1}月`, income: totals.income, expense: totals.expense });
    }
    const maximum = Math.max(...months.flatMap((item) => [item.income, item.expense]), 1);
    const rows = months.map((item) => {
      const row = document.createElement("div"); row.className = "trend-row";
      const label = document.createElement("span"); label.textContent = item.label;
      const bars = document.createElement("div"); bars.className = "trend-bars";
      const income = document.createElement("i"); income.className = "income"; income.style.width = `${Math.max(item.income ? 2 : 0, item.income / maximum * 100)}%`; income.title = `收入 ${money(item.income)}`;
      const expense = document.createElement("i"); expense.className = "expense"; expense.style.width = `${Math.max(item.expense ? 2 : 0, item.expense / maximum * 100)}%`; expense.title = `支出 ${money(item.expense)}`;
      bars.append(income, expense);
      const values = document.createElement("strong"); values.textContent = `收 ${money(item.income)}｜支 ${money(item.expense)}`;
      row.append(label, bars, values); return row;
    });
    elements.trendChart.replaceChildren(...rows);
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
    refreshEntryFields(); renderRecent(); renderMonthly(); renderCashflow(); renderCharts(); renderTrends(); renderAccounts();
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

  function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function exportJson() { if (!confirm("帳務備份沒有加密，請勿上傳至公開GitHub。確定匯出？")) return; download(`EliNotebook-accounting-${localDateKey()}.json`, JSON.stringify({ app: "EliNotebook Accounting", exportedAt: new Date().toISOString(), ...ledger }, null, 2), "application/json;charset=utf-8"); }
  function exportCsv() {
    if (!confirm("CSV沒有加密，請勿分享給他人。確定匯出？")) return;
    const rows = [["日期", "類型", "分類", "金額", "帳戶", "轉入帳戶", "備註", "本機識別碼"], ...ledger.transactions.map((item) => [item.date, TYPE_LABEL[item.type], item.category, item.amount, accountName(item.accountId), item.toAccountId ? accountName(item.toAccountId) : "", item.note, item.fingerprint])];
    download(`EliNotebook-accounting-${localDateKey()}.csv`, `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
  }

  function parseCsv(text) {
    const rows = []; let row = [], cell = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) { const character = text[index]; if (quoted && character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = !quoted; else if (character === "," && !quoted) { row.push(cell); cell = ""; } else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ""; } else cell += character; }
    row.push(cell); if (row.some((value) => value.trim())) rows.push(row); return rows;
  }

  function importAccounting(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("檔案超過5MB，已停止匯入。"); event.target.value = ""; return; }
    const extension = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader(); reader.addEventListener("load", () => {
      try {
        let imported;
        if (extension === "json") imported = normalizeLedger(JSON.parse(String(reader.result)));
        else if (extension === "csv") {
          const rows = parseCsv(String(reader.result).replace(/^\uFEFF/, "")); const headers = rows.shift() || [];
          const indexOf = (name) => headers.indexOf(name); const accountByName = (name) => ledger.accounts.find((item) => item.name === name)?.id || ledger.accounts[0].id;
          const typeMap = { 收入: "income", 支出: "expense", 轉移: "transfer" };
          const transactions = rows.map((row) => normalizeTransaction({ date: row[indexOf("日期")], type: typeMap[row[indexOf("類型")]], category: row[indexOf("分類")], amount: row[indexOf("金額")], accountId: accountByName(row[indexOf("帳戶")]), toAccountId: row[indexOf("轉入帳戶")] ? accountByName(row[indexOf("轉入帳戶")]) : "", note: row[indexOf("備註")] }, ledger.accounts[0].id, new Set(ledger.accounts.map((item) => item.id)))).filter(Boolean);
          imported = { ...ledger, transactions };
        } else throw new Error("不支援的格式");
        const existing = new Set(ledger.transactions.map((item) => item.fingerprint)); const newItems = imported.transactions.filter((item) => !existing.has(item.fingerprint));
        const replace = window.confirm(`讀取到${imported.transactions.length}筆，其中${newItems.length}筆不是重複紀錄。\n\n按「確定」取代目前帳務；按「取消」合併不重複紀錄。`);
        const previous = ledger; ledger = replace ? imported : { ...ledger, transactions: [...newItems, ...ledger.transactions].slice(0, MAX_TRANSACTIONS) };
        if (!saveLedger()) ledger = previous; renderAccounting();
      } catch (error) { console.error("帳務匯入失敗：", error); alert("無法匯入，請確認是本工具匯出的JSON或CSV。"); }
      finally { event.target.value = ""; }
    }); reader.readAsText(file, "utf-8");
  }

  elements.authForm.addEventListener("submit", handleFinanceAuth);
  elements.forgotPin.addEventListener("click", forgetFinancePin);
  elements.financeLock.addEventListener("click", () => lockFinance("你已手動上鎖，請重新驗證本機PIN。"));
  elements.tabs.forEach((button) => button.addEventListener("click", () => {
    elements.tabs.forEach((item) => { const active = item === button; item.classList.toggle("active", active); if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); });
    elements.panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.accountingPanel === button.dataset.accountingTab));
  }));
  elements.naturalForm.addEventListener("submit", (event) => { event.preventDefault(); const parsed = parseNatural(elements.naturalInput.value.trim()); if (!parsed) { elements.naturalFeedback.textContent = "找不到金額，請輸入例如：午餐120現金。"; return; } if (parsed.type === "transfer" && !parsed.toAccountId) { elements.naturalFeedback.textContent = "帳戶轉移請同時寫出兩個帳戶名稱，或使用按鈕式記帳。"; return; } if (addTransaction(parsed, elements.naturalFeedback)) elements.naturalForm.reset(); });
  elements.fixedForm.addEventListener("submit", (event) => { event.preventDefault(); const parsed = parseFixed(elements.fixedInput.value.trim()); if (!parsed) { elements.fixedFeedback.textContent = "格式不正確，請依照範例輸入。"; return; } if (addTransaction(parsed, elements.fixedFeedback)) elements.fixedForm.reset(); });
  elements.typeButtons.forEach((button) => button.addEventListener("click", () => { elements.type.value = button.dataset.moneyType; elements.typeButtons.forEach((item) => item.classList.toggle("active", item === button)); refreshEntryFields(); }));
  elements.account.addEventListener("change", refreshEntryFields);
  elements.buttonForm.addEventListener("submit", (event) => { event.preventDefault(); const added = addTransaction({ type: elements.type.value, amount: elements.amount.value, category: elements.category.value, accountId: elements.account.value, toAccountId: elements.toAccount.value, date: elements.date.value, note: elements.note.value }); if (added) { elements.amount.value = ""; elements.note.value = ""; elements.date.value = localDateKey(); } });
  [elements.monthFilter, elements.typeFilter, elements.search].forEach((control) => control.addEventListener("input", renderRecent));
  elements.summaryMonth.addEventListener("change", renderMonthly);
  function moveMonth(offset) { const [year, month] = elements.summaryMonth.value.split("-").map(Number); const date = new Date(year, month - 1 + offset, 1); elements.summaryMonth.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; renderMonthly(); }
  elements.previousMonth.addEventListener("click", () => moveMonth(-1)); elements.nextMonth.addEventListener("click", () => moveMonth(1));
  elements.accountForm.addEventListener("submit", (event) => { event.preventDefault(); const name = cleanText(elements.accountName.value, 30); if (ledger.accounts.some((item) => item.name === name)) { alert("帳戶名稱已存在。"); return; } ledger.accounts.push({ id: createId("account"), name, openingBalance: safeNumber(elements.accountBalance.value) }); saveLedger(); elements.accountForm.reset(); elements.accountBalance.value = "0"; renderAccounting(); });
  elements.categoryForm.addEventListener("submit", (event) => { event.preventDefault(); const type = elements.categoryType.value; const name = cleanText(elements.categoryName.value, 20); if (ledger.categories[type].includes(name)) { alert("分類名稱已存在。"); return; } ledger.categories[type].push(name); saveLedger(); elements.categoryForm.reset(); renderAccounting(); });
  elements.exportJson.addEventListener("click", exportJson); elements.exportCsv.addEventListener("click", exportCsv); elements.importFile.addEventListener("change", importAccounting);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) { ledger = loadLedger(); renderAccounting(); }
    if (event.key === AUTH_KEY && financeUnlocked) lockFinance("PIN設定已在其他分頁變更，請重新驗證。");
  });
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view !== "accounting" && financeUnlocked) lockFinance("你已離開私人財務中心，請重新驗證本機PIN。");
  }));
  document.addEventListener("visibilitychange", () => { if (document.hidden && financeUnlocked) lockFinance("你已離開分頁，私人財務中心已自動上鎖。"); });
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => document.addEventListener(eventName, () => { if (financeUnlocked) scheduleFinanceLock(); }, { passive: true }));

  elements.date.value = localDateKey(); elements.monthFilter.value = currentMonth(); elements.summaryMonth.value = currentMonth(); renderAccounting(); initFinanceAuth();
});
