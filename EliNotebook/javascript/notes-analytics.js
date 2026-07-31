"use strict";

// EliNotebook 3.7 備忘錄分析核心。
// 特性：只進行完成紀錄、年度比較與四象限座標計算；不讀寫DOM、localStorage或網路。
// 效果：未來網頁或後端可以共用同一套統計定義，避免圖表與數字不一致。
(function exposeNotesAnalytics(global) {
  const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

  function validDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function completionDate(task) {
    if (!task?.completed) return null;
    return validDate(task.completedAt) || validDate(task.updatedAt) || validDate(task.createdAt);
  }

  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }

  function shiftMonth(date, offset) { return new Date(date.getFullYear(), date.getMonth() + offset, 1); }

  function sameMomentPriorYear(now) {
    const lastDay = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0).getDate();
    return new Date(now.getFullYear() - 1, now.getMonth(), Math.min(now.getDate(), lastDay), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  }

  function compare(current, previous) {
    const delta = current - previous;
    const percentage = previous ? delta / previous * 100 : null;
    return { current, previous, delta, percentage };
  }

  function completionStats(tasks, now = new Date()) {
    const completed = tasks.map((task) => ({ task, date: completionDate(task) })).filter((item) => item.date);
    const currentMonth = monthKey(now);
    const previousMonthDate = shiftMonth(now, -1);
    const previousMonthKey = monthKey(previousMonthDate);
    const currentYearStart = new Date(now.getFullYear(), 0, 1);
    const priorYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const priorYearEnd = sameMomentPriorYear(now);
    const thisMonth = completed.filter((item) => monthKey(item.date) === currentMonth).length;
    const previousMonth = completed.filter((item) => monthKey(item.date) === previousMonthKey).length;
    const thisYear = completed.filter((item) => item.date >= currentYearStart && item.date <= now).length;
    const priorYearSamePeriod = completed.filter((item) => item.date >= priorYearStart && item.date <= priorYearEnd).length;
    const priorYearFull = completed.filter((item) => item.date.getFullYear() === now.getFullYear() - 1).length;
    return {
      total: completed.length,
      thisMonth,
      previousMonth,
      previousMonthLabel: MONTH_LABELS[previousMonthDate.getMonth()],
      monthComparison: compare(thisMonth, previousMonth),
      thisYear,
      priorYearSamePeriod,
      priorYearFull,
      yearComparison: compare(thisYear, priorYearSamePeriod),
      completionRate: tasks.length ? completed.length / tasks.length * 100 : 0
    };
  }

  function monthlyCompletionSeries(tasks, now = new Date()) {
    const dates = tasks.map(completionDate).filter(Boolean);
    const counts = new Map();
    dates.forEach((date) => counts.set(monthKey(date), (counts.get(monthKey(date)) || 0) + 1));
    const months = [];
    for (let offset = -11; offset <= 0; offset += 1) {
      const date = shiftMonth(now, offset);
      const priorDate = shiftMonth(date, -12);
      months.push({
        key: monthKey(date),
        label: MONTH_LABELS[date.getMonth()],
        year: date.getFullYear(),
        current: counts.get(monthKey(date)) || 0,
        previous: counts.get(monthKey(priorDate)) || 0
      });
    }
    return {
      months,
      currentTotal: months.reduce((sum, item) => sum + item.current, 0),
      previousTotal: months.reduce((sum, item) => sum + item.previous, 0)
    };
  }

  function quadrantKey(task) {
    if (task.important && task.urgent) return "q1";
    if (task.important) return "q2";
    if (task.urgent) return "q3";
    return "q4";
  }

  function stringHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  function quadrantPoint(task) {
    const quadrant = quadrantKey(task);
    const hash = stringHash(task.id || task.content);
    const horizontal = 6 + (hash % 33);
    const vertical = 6 + ((hash >>> 8) % 33);
    const right = quadrant === "q2" || quadrant === "q4";
    const bottom = quadrant === "q3" || quadrant === "q4";
    return { quadrant, x: right ? 56 + horizontal : horizontal, y: bottom ? 56 + vertical : vertical };
  }

  function quadrantDistribution(tasks) {
    const points = tasks.map((task) => ({ task, ...quadrantPoint(task) }));
    const counts = { q1: 0, q2: 0, q3: 0, q4: 0 };
    points.forEach((point) => { counts[point.quadrant] += 1; });
    return { points, counts };
  }

  global.EliNotesAnalytics = Object.freeze({ completionDate, completionStats, monthlyCompletionSeries, quadrantKey, quadrantDistribution });
})(window);
