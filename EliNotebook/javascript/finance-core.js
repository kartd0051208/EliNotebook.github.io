"use strict";

// EliNotebook 3.6 財務領域核心。
// 特性：這裡只負責日期與金額計算，不讀寫DOM、localStorage，也不進行任何網路連線。
// 效果：網頁、未來後端與LINE機器人可以共用同一套計算規則，降低三邊結果不一致的風險。
(function exposeFinanceCore(global) {
  const DAY_MILLISECONDS = 86400000;
  const MAX_AMOUNT = 999999999999;

  function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }

  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, integer(value, minimum))); }

  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function validMonthKey(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    const month = Number(match[2]);
    return Number(match[1]) >= 2000 && Number(match[1]) <= 2200 && month >= 1 && month <= 12;
  }

  function shiftMonthKey(value, offset) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
    if (!match) return monthKey();
    return monthKey(new Date(Number(match[1]), Number(match[2]) - 1 + integer(offset), 1));
  }

  function dateForMonthDay(month, requestedDay) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return new Date(year, monthIndex, Math.min(clamp(requestedDay, 1, 31), lastDay));
  }

  function dateSerial(date) { return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()); }

  function daysBetween(from, to) { return Math.max(0, Math.round((dateSerial(to) - dateSerial(from)) / DAY_MILLISECONDS)); }

  function normalizePlanning(value) {
    const salaryDay = integer(value?.salaryDay);
    return {
      salaryDay: salaryDay >= 1 && salaryDay <= 31 ? salaryDay : 0,
      reserveAmount: clamp(value?.reserveAmount || 0, 0, MAX_AMOUNT),
      includeInstallments: value?.includeInstallments !== false
    };
  }

  function normalizeInstallment(value, fallbackId) {
    if (!value || typeof value !== "object") return null;
    const name = String(value.name || "").trim().slice(0, 40);
    const totalAmount = clamp(value.totalAmount || 0, 0, MAX_AMOUNT);
    const installmentCount = clamp(value.installmentCount || 1, 1, 360);
    if (!name || !totalAmount) return null;
    const paidCount = clamp(value.paidCount || 0, 0, installmentCount);
    return {
      id: String(value.id || fallbackId || "").slice(0, 100),
      name,
      totalAmount,
      installmentCount,
      paidCount,
      firstDueMonth: validMonthKey(value.firstDueMonth) ? value.firstDueMonth : monthKey(),
      dueDay: clamp(value.dueDay || 1, 1, 31),
      createdAt: Number.isNaN(Date.parse(value.createdAt)) ? new Date().toISOString() : value.createdAt
    };
  }

  function installmentPaymentAmount(item, paymentIndex) {
    if (!item || paymentIndex < 0 || paymentIndex >= item.installmentCount) return 0;
    const regular = Math.floor(item.totalAmount / item.installmentCount);
    return paymentIndex === item.installmentCount - 1 ? item.totalAmount - regular * (item.installmentCount - 1) : regular;
  }

  function installmentPayment(item, paymentIndex) {
    const dueMonth = shiftMonthKey(item.firstDueMonth, paymentIndex);
    const dueDate = dateForMonthDay(dueMonth, item.dueDay);
    return { index: paymentIndex, dueMonth, dueDate, dueDateKey: localDateKey(dueDate), amount: installmentPaymentAmount(item, paymentIndex) };
  }

  function installmentRemaining(item) {
    let remaining = 0;
    for (let index = item.paidCount; index < item.installmentCount; index += 1) remaining += installmentPaymentAmount(item, index);
    return remaining;
  }

  function installmentSummary(item, now = new Date()) {
    const complete = item.paidCount >= item.installmentCount;
    const nextPayment = complete ? null : installmentPayment(item, item.paidCount);
    return {
      ...item,
      complete,
      remainingCount: Math.max(0, item.installmentCount - item.paidCount),
      remainingAmount: installmentRemaining(item),
      nextPayment,
      overdue: Boolean(nextPayment && dateSerial(nextPayment.dueDate) < dateSerial(now))
    };
  }

  function paymentsDueThrough(item, horizon) {
    if (!horizon) return { amount: 0, count: 0 };
    let amount = 0;
    let count = 0;
    for (let index = item.paidCount; index < item.installmentCount; index += 1) {
      const payment = installmentPayment(item, index);
      if (dateSerial(payment.dueDate) > dateSerial(horizon)) break;
      amount += payment.amount;
      count += 1;
    }
    return { amount, count };
  }

  function nextPayday(planningValue, now = new Date()) {
    const planning = normalizePlanning(planningValue);
    if (!planning.salaryDay) return null;
    const currentMonthPayday = dateForMonthDay(monthKey(now), planning.salaryDay);
    if (dateSerial(currentMonthPayday) >= dateSerial(now)) return currentMonthPayday;
    return dateForMonthDay(shiftMonthKey(monthKey(now), 1), planning.salaryDay);
  }

  function computeDashboard({ accountBalances = [], planning: planningValue, installments = [], now = new Date() } = {}) {
    const planning = normalizePlanning(planningValue);
    const payday = nextPayday(planning, now);
    const normalizedInstallments = installments.map((item) => normalizeInstallment(item, item?.id)).filter(Boolean);
    const installmentSummaries = normalizedInstallments.map((item) => installmentSummary(item, now));
    const activeInstallments = installmentSummaries.filter((item) => !item.complete);
    const currentBalance = accountBalances.reduce((sum, value) => sum + integer(value), 0);
    const installmentRemainingAmount = activeInstallments.reduce((sum, item) => sum + item.remainingAmount, 0);
    const dueBeforePayday = planning.includeInstallments && payday
      ? activeInstallments.reduce((sum, item) => sum + paymentsDueThrough(item, payday).amount, 0)
      : 0;
    const availableFunds = currentBalance - planning.reserveAmount - dueBeforePayday;
    return {
      asOf: localDateKey(now),
      currentBalance,
      reserveAmount: planning.reserveAmount,
      dueBeforePayday,
      availableFunds,
      payday: payday ? localDateKey(payday) : "",
      daysUntilPayday: payday ? daysBetween(now, payday) : null,
      installmentRemainingAmount,
      activeInstallmentCount: activeInstallments.length,
      overdueInstallmentCount: activeInstallments.filter((item) => item.overdue).length,
      installments: installmentSummaries
    };
  }

  function buildLineSummary(dashboard) {
    // 未來後端只需要把這個「摘要」傳給LINE；不應把全部交易明細或加密金鑰交給LINE。
    return Object.freeze({
      schemaVersion: 1,
      asOf: String(dashboard.asOf || ""),
      availableFunds: integer(dashboard.availableFunds),
      currentBalance: integer(dashboard.currentBalance),
      reserveAmount: integer(dashboard.reserveAmount),
      dueBeforePayday: integer(dashboard.dueBeforePayday),
      payday: String(dashboard.payday || ""),
      daysUntilPayday: dashboard.daysUntilPayday === null ? null : integer(dashboard.daysUntilPayday),
      installmentRemainingAmount: integer(dashboard.installmentRemainingAmount),
      activeInstallmentCount: integer(dashboard.activeInstallmentCount),
      overdueInstallmentCount: integer(dashboard.overdueInstallmentCount)
    });
  }

  global.EliFinanceCore = Object.freeze({
    schemaVersion: 2,
    localDateKey,
    monthKey,
    normalizePlanning,
    normalizeInstallment,
    installmentSummary,
    paymentsDueThrough,
    nextPayday,
    computeDashboard,
    buildLineSummary
  });
})(window);
