/* =============================================================================
   核保工具中心：計算核心

   純函式，不碰 DOM、不發網路請求，因此可離線執行，也可在 Node 下單元測試。
   瀏覽器掛在 window.UwCore。

   IRR、複利、貸款這三類刻意不放在這裡 —— 金融工具中心（financial-tools）
   已有更完整的版本（含 XIRR、XNPV、提前還款），重複實作只會讓兩邊數字不一致。

   所有涉及法規或核保慣例的常數都集中在檔末的資料區並標註來源，便於單點更新。
   ============================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.UwCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---------------------------------------------------------------------------
     日期基礎工具
     --------------------------------------------------------------------------- */

  var MS_DAY = 86400000;

  /** 把 'YYYY-MM-DD' 或 Date 正規化成本地時區的 Date（時分秒歸零）。 */
  function toDate(value) {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === "string") {
      var m = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
      if (!m) return null;
      return makeDate(+m[1], +m[2], +m[3]);
    }
    return null;
  }

  /** 建立日期並驗證該日確實存在（擋掉 2 月 30 日這種輸入）。 */
  function makeDate(y, m, d) {
    var dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysInMonth(y, m) {
    return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtDate(d) {
    if (!d) return "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function addDays(d, n) {
    var r = new Date(d.getTime());
    r.setDate(r.getDate() + n);
    return r;
  }

  /** 加月份。遇到 1/31 + 1 個月這種情形，夾到當月最後一天（保險實務慣例）。 */
  function addMonths(d, n) {
    var m = d.getMonth() + n;
    var targetY = d.getFullYear() + Math.floor(m / 12);
    var targetM = ((m % 12) + 12) % 12;
    var day = Math.min(d.getDate(), daysInMonth(targetY, targetM + 1));
    return new Date(targetY, targetM, day);
  }

  /** 用 UTC 取差值，避開日光節約時間造成的 23／25 小時誤差。 */
  function diffDays(from, to) {
    var a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    var b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / MS_DAY);
  }

  /** 年／月／日的曆法差距（不是用平均天數估算）。 */
  function calendarDiff(from, to) {
    if (diffDays(from, to) < 0) return null;
    var years = to.getFullYear() - from.getFullYear();
    var months = to.getMonth() - from.getMonth();
    var days = to.getDate() - from.getDate();
    if (days < 0) {
      months -= 1;
      var pm = to.getMonth() === 0 ? 12 : to.getMonth();
      var py = to.getMonth() === 0 ? to.getFullYear() - 1 : to.getFullYear();
      days += daysInMonth(py, pm);
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years: years, months: months, days: days };
  }

  /* ---------------------------------------------------------------------------
     1. 民國 ⇄ 西元
     --------------------------------------------------------------------------- */

  /** 西元 → 民國。1912 年以前回傳民國前（before = true）。 */
  function adToRoc(year) {
    var roc = year - 1911;
    if (roc >= 1) return { roc: roc, before: false, label: "民國 " + roc + " 年" };
    var n = 1912 - year;
    return { roc: -n, before: true, label: "民國前 " + n + " 年" };
  }

  /** 民國 → 西元。before = true 表示輸入的是「民國前 N 年」。 */
  function rocToAd(rocYear, before) {
    return before ? 1912 - Math.abs(rocYear) : rocYear + 1911;
  }

  /** 完整日期換算，含日期合法性驗證。 */
  function convertRocDate(input) {
    var adYear = input.mode === "roc" ? rocToAd(input.year, !!input.before) : input.year;
    var dt = makeDate(adYear, input.month, input.day);
    if (!dt) return { ok: false, error: "這個日期不存在，請確認月份與日數" };

    var roc = adToRoc(adYear);
    var weekday = ["日", "一", "二", "三", "四", "五", "六"][dt.getDay()];
    return {
      ok: true,
      date: dt,
      ad: adYear + "-" + pad2(input.month) + "-" + pad2(input.day),
      adYear: adYear,
      roc: roc.roc,
      rocBefore: roc.before,
      rocLabel: roc.label + input.month + "月" + input.day + "日",
      rocCompact: roc.before
        ? "民前" + Math.abs(roc.roc) + "." + pad2(input.month) + "." + pad2(input.day)
        : String(roc.roc).padStart(3, "0") + "." + pad2(input.month) + "." + pad2(input.day),
      weekday: "星期" + weekday,
      isLeap: isLeapYear(adYear)
    };
  }

  /* ---------------------------------------------------------------------------
     2. 實足年齡 / 月齡 / 日齡
     --------------------------------------------------------------------------- */

  function actualAge(birth, ref) {
    var b = toDate(birth);
    var r = toDate(ref) || toDate(new Date());
    if (!b || !r) return { ok: false, error: "日期格式錯誤" };
    var days = diffDays(b, r);
    if (days < 0) return { ok: false, error: "基準日早於出生日" };

    var cd = calendarDiff(b, r);
    var totalMonths = cd.years * 12 + cd.months;
    return {
      ok: true,
      years: cd.years,
      months: cd.months,
      days: cd.days,
      totalMonths: totalMonths,
      totalWeeks: Math.floor(days / 7),
      remainderDaysInWeek: days % 7,
      totalDays: days,
      text: cd.years + " 歲 " + cd.months + " 個月 " + cd.days + " 天",
      infantText: totalMonths + " 個月又 " + cd.days + " 天"
    };
  }

  /* ---------------------------------------------------------------------------
     3. 保險年齡

     各壽險公司要保書一致採用：
       「投保年齡以足歲計算，但未滿一歲之零數超過六個月者，加算一歲。」
     因此「剛好滿六個月」不進位，超過六個月（六個月又一天起）才進位。
     --------------------------------------------------------------------------- */

  function insuranceAge(birth, ref) {
    var b = toDate(birth);
    var r = toDate(ref) || toDate(new Date());
    if (!b || !r) return { ok: false, error: "日期格式錯誤" };
    if (diffDays(b, r) < 0) return { ok: false, error: "投保日早於出生日" };

    var cd = calendarDiff(b, r);
    var over6 = cd.months > 6 || (cd.months === 6 && cd.days > 0);
    var age = cd.years + (over6 ? 1 : 0);

    // 保險年齡下一次跳動的日子：生日 + 6 個月 + 1 天
    var bump = addDays(addMonths(addMonths(b, cd.years * 12), 6), 1);
    if (diffDays(r, bump) < 0) {
      bump = addDays(addMonths(addMonths(b, (cd.years + 1) * 12), 6), 1);
    }
    var deadline = addDays(bump, -1); // 這天（含）以前投保仍算目前的保險年齡

    return {
      ok: true,
      age: age,
      actualText: cd.years + " 歲 " + cd.months + " 個月 " + cd.days + " 天",
      rounded: over6,
      note: over6
        ? "足歲 " + cd.years + " 歲，零數 " + cd.months + " 個月 " + cd.days + " 天已超過 6 個月，加算一歲。"
        : "足歲 " + cd.years + " 歲，零數 " + cd.months + " 個月 " + cd.days + " 天未超過 6 個月，不加算。",
      nextAge: age + 1,
      bumpDate: bump,
      bumpDateText: fmtDate(bump),
      deadline: deadline,
      deadlineText: fmtDate(deadline),
      daysLeft: diffDays(r, deadline)
    };
  }

  /* ---------------------------------------------------------------------------
     4. BMI 與體位核保
     --------------------------------------------------------------------------- */

  // 衛福部國民健康署成人肥胖定義
  var ADULT_BMI_BANDS = [
    { max: 18.5, label: "體重過輕", tone: "warn" },
    { max: 24, label: "健康體位", tone: "good" },
    { max: 27, label: "體重過重", tone: "warn" },
    { max: 30, label: "輕度肥胖", tone: "bad" },
    { max: 35, label: "中度肥胖", tone: "bad" },
    { max: Infinity, label: "重度肥胖", tone: "bad" }
  ];

  // 壽險體位核保的常見分帶。各公司標準不同，僅供送件前評估方向。
  var UW_BMI_BANDS = [
    { max: 16, label: "偏低，多數公司要求說明或體檢，可能延期", tone: "bad" },
    { max: 17.5, label: "偏低，部分公司需補充體重變化說明", tone: "warn" },
    { max: 30, label: "一般落在標準體區間", tone: "good" },
    { max: 33, label: "常見加費區間（約加 25%～50%）", tone: "warn" },
    { max: 36, label: "加費幅度明顯上升，部分公司謝絕醫療險", tone: "bad" },
    { max: Infinity, label: "多數公司拒保醫療／實支實付，需個案送審", tone: "bad" }
  ];

  function pickBand(bands, value) {
    for (var i = 0; i < bands.length; i++) if (value < bands[i].max) return bands[i];
    return bands[bands.length - 1];
  }

  function bmi(heightCm, weightKg) {
    var h = Number(heightCm);
    var w = Number(weightKg);
    if (!(h > 0) || !(w > 0)) return { ok: false, error: "請輸入身高與體重" };
    if (h > 250 || w > 400) return { ok: false, error: "數值超出合理範圍" };

    var m = h / 100;
    var value = w / (m * m);
    var lo = 18.5 * m * m;
    var hi = 24 * m * m;
    var band = pickBand(ADULT_BMI_BANDS, value);
    var uw = pickBand(UW_BMI_BANDS, value);

    return {
      ok: true,
      value: Math.round(value * 100) / 100,
      category: band.label,
      tone: band.tone,
      underwriting: uw.label,
      underwritingTone: uw.tone,
      healthyWeightMin: Math.round(lo * 10) / 10,
      healthyWeightMax: Math.round(hi * 10) / 10,
      gapToHealthy: w < lo ? Math.round((lo - w) * 10) / 10 : w > hi ? -Math.round((w - hi) * 10) / 10 : 0
    };
  }

  /* ---------------------------------------------------------------------------
     5. 矯正年齡（早產兒）

     矯正年齡 = 實際年齡 −（40 週 − 出生時妊娠週數）
     臨床上通常用到矯正 24 個月大為止。
     --------------------------------------------------------------------------- */

  function correctedAge(birth, ref, gaWeeks, gaDays) {
    var b = toDate(birth);
    var r = toDate(ref) || toDate(new Date());
    if (!b || !r) return { ok: false, error: "日期格式錯誤" };
    var w = Number(gaWeeks);
    var d = Number(gaDays || 0);
    if (!(w >= 20 && w <= 45)) return { ok: false, error: "妊娠週數請輸入 20～45" };
    if (!(d >= 0 && d <= 6)) return { ok: false, error: "妊娠天數請輸入 0～6" };

    var chronoDays = diffDays(b, r);
    if (chronoDays < 0) return { ok: false, error: "基準日早於出生日" };

    var prematureDays = 40 * 7 - (w * 7 + d);
    var correctedDays = chronoDays - prematureDays;
    var term = prematureDays <= 0;
    var dueDate = addDays(b, prematureDays); // 原預產期

    function fmt(days) {
      if (days < 0) return "尚未到達原預產期（還差 " + -days + " 天）";
      var months = Math.floor(days / 30.4375);
      return months + " 個月 " + Math.round(days - months * 30.4375) + " 天";
    }

    return {
      ok: true,
      term: term,
      prematureWeeks: Math.floor(prematureDays / 7),
      prematureDays: prematureDays,
      dueDate: dueDate,
      dueDateText: fmtDate(dueDate),
      chronoDays: chronoDays,
      chronoText: fmt(chronoDays),
      correctedDays: correctedDays,
      correctedText: term ? "足月，不需矯正" : fmt(correctedDays),
      stillCorrecting: !term && correctedDays < 730,
      note: term
        ? "妊娠滿 40 週以上，實際年齡即為評估年齡。"
        : "早產 " + Math.floor(prematureDays / 7) + " 週 " + (prematureDays % 7) + " 天，一般矯正至矯正年齡滿 2 歲為止。"
    };
  }

  /* ---------------------------------------------------------------------------
     6. 新生兒投保門檻檢核
     --------------------------------------------------------------------------- */

  function newbornEligibility(input) {
    var w = Number(input.gestWeeks);
    var g = Number(input.birthWeight);
    var items = [];

    var weekPass = w >= 37;
    items.push({
      label: "妊娠週數",
      value: w + " 週",
      pass: weekPass,
      standard: "≥ 37 週",
      note: weekPass ? "符合一般核保門檻" : "早產，多數公司需觀察後再議或要求檢附出院病歷"
    });

    var weightPass = g >= 2500;
    items.push({
      label: "出生體重",
      value: g + " 公克",
      pass: weightPass,
      standard: "≥ 2,500 公克",
      note: weightPass ? "符合一般核保門檻" : "低出生體重，通常需追蹤生長狀況後再送件"
    });

    var nicuPass = !input.nicu;
    items.push({
      label: "保溫箱／NICU",
      value: input.nicu ? "曾住保溫箱或 NICU" : "未住保溫箱",
      pass: nicuPass,
      standard: "未入住為佳",
      note: nicuPass ? "無需額外檢附" : "須檢附出院病歷摘要，核保會逐項檢視住院原因"
    });

    var dischargePass = !!input.discharged;
    items.push({
      label: "出院狀態",
      value: input.discharged ? "已出院" : "尚未出院",
      pass: dischargePass,
      standard: "須已出院",
      note: dischargePass ? "可送件" : "住院中無法投保，須待出院並穩定後再議"
    });

    var idPass = !!input.hasId;
    items.push({
      label: "身分證字號",
      value: input.hasId ? "已完成出生登記" : "尚未取得",
      pass: idPass,
      standard: "必要",
      note: idPass ? "可填寫要保書" : "須先至戶政事務所辦理出生登記"
    });

    var blockers = items.filter(function (i) {
      return !i.pass;
    });

    var verdict, tone;
    if (!blockers.length) {
      verdict = "符合一般送件門檻";
      tone = "good";
    } else if (!idPass || !dischargePass) {
      verdict = "尚不可送件";
      tone = "bad";
    } else {
      verdict = "可送件但屬體況件";
      tone = "warn";
    }

    return {
      ok: true,
      items: items,
      blockers: blockers.length,
      verdict: verdict,
      tone: tone,
      advice:
        tone === "good"
          ? "可依商品規則正常投保。"
          : tone === "bad"
            ? "請先完成上表未達標的必要項目。"
            : "建議先向保險公司做事先徵詢（預核保），避免留下拒保紀錄。"
    };
  }

  /* ---------------------------------------------------------------------------
     7. 等待期與保障起日
     --------------------------------------------------------------------------- */

  var WAITING_PERIODS = [
    { key: "disease", label: "一般疾病（住院醫療、實支實付）", days: 30, alt: "" },
    { key: "cancer", label: "癌症險", days: 90, alt: "部分商品為 30 天，以條款為準" },
    { key: "cimajor", label: "重大疾病／重大傷病", days: 90, alt: "部分商品為 30 天" },
    { key: "ltc", label: "長期照顧險", days: 90, alt: "" },
    { key: "dread", label: "特定傷病險", days: 90, alt: "" },
    { key: "accident", label: "意外傷害（傷害醫療）", days: 0, alt: "無等待期，生效即有保障" },
    { key: "newborn", label: "衛福部公告新生兒篩檢項目疾病", days: 0, alt: "金管會函令排除等待期，不得拒賠" }
  ];

  function waitingPeriod(effectiveDate, days) {
    var e = toDate(effectiveDate);
    if (!e) return { ok: false, error: "請輸入保單生效日" };
    var n = Number(days);
    if (!(n >= 0)) return { ok: false, error: "等待期天數錯誤" };

    var endDate = addDays(e, n); // 等待期屆滿日
    var coverFrom = n === 0 ? e : addDays(endDate, 1); // 次日起有保障
    var today = toDate(new Date());
    var remaining = diffDays(today, coverFrom);

    return {
      ok: true,
      effective: e,
      effectiveText: fmtDate(e),
      days: n,
      endDate: endDate,
      endDateText: fmtDate(endDate),
      coverFrom: coverFrom,
      coverFromText: fmtDate(coverFrom),
      passed: remaining <= 0,
      remaining: Math.max(remaining, 0),
      note:
        n === 0
          ? "無等待期，保單生效當日即有保障。"
          : "生效日起算 " + n + " 天為等待期，" + fmtDate(coverFrom) + " 起發生的疾病才在保障範圍內。"
    };
  }

  /* ---------------------------------------------------------------------------
     8. 繳費期別換算

     台灣壽險業通用的期別係數（乘以年繳保費）。
     各公司可能微調，若條款另有規定以條款為準。
     --------------------------------------------------------------------------- */

  var PREMIUM_MODES = [
    { key: "annual", label: "年繳", factor: 1, times: 1 },
    { key: "semi", label: "半年繳", factor: 0.52, times: 2 },
    { key: "quarter", label: "季繳", factor: 0.262, times: 4 },
    { key: "monthly", label: "月繳", factor: 0.088, times: 12 }
  ];

  function premiumModes(annualPremium) {
    var p = Number(annualPremium);
    if (!(p > 0)) return { ok: false, error: "請輸入年繳保費" };

    var rows = PREMIUM_MODES.map(function (m) {
      var each = Math.round(p * m.factor);
      var yearly = each * m.times;
      return {
        key: m.key,
        label: m.label,
        factor: m.factor,
        times: m.times,
        each: each,
        yearly: yearly,
        extra: yearly - p,
        extraRate: Math.round(((yearly - p) / p) * 10000) / 100
      };
    });

    return { ok: true, annual: p, rows: rows };
  }

  /* ---------------------------------------------------------------------------
     9. 未滿 15 歲喪葬費用保險金上限

     保險法第 107 條：喪葬費用保險金額不得超過遺產及贈與稅法第 17 條
     遺產稅喪葬費扣除額之「一半」。扣除額每年由財政部公告。
     --------------------------------------------------------------------------- */

  var FUNERAL_DEDUCTION_HISTORY = [
    { year: "115 年度（2026）", deduction: 1380000 },
    { year: "113 年度（2024）", deduction: 1370000 },
    { year: "109–112 年度", deduction: 1230000 }
  ];

  function minorDeathCap(deduction) {
    var d = Number(deduction);
    if (!(d > 0)) return { ok: false, error: "請輸入遺產稅喪葬費扣除額" };
    return {
      ok: true,
      deduction: d,
      cap: d / 2,
      note:
        "未滿 15 歲之被保險人，除喪葬費用給付外，其餘死亡給付於滿 15 歲時始生效力；" +
        "15 歲前身故僅退還所繳保險費加計利息。"
    };
  }

  /* ---------------------------------------------------------------------------
     10. 壽險保額缺口（遺屬需求法）
     --------------------------------------------------------------------------- */

  function positive(v) {
    return Math.max(Number(v) || 0, 0);
  }

  function coverageGap(input) {
    var living = positive(input.annualLiving) * positive(input.supportYears);
    var needItems = [
      { label: "家庭生活費", value: living },
      { label: "子女教育金", value: positive(input.education) },
      { label: "房貸餘額", value: positive(input.mortgage) },
      { label: "喪葬及後事費用", value: positive(input.funeral) },
      { label: "其他負債", value: positive(input.otherDebt) }
    ];
    var resourceItems = [
      { label: "既有壽險保額", value: positive(input.existingCoverage) },
      { label: "可動用流動資產", value: positive(input.liquidAssets) },
      { label: "勞保／團保給付估計", value: positive(input.laborInsurance) }
    ];

    var sum = function (arr) {
      return arr.reduce(function (s, i) {
        return s + i.value;
      }, 0);
    };
    var need = sum(needItems);
    var resource = sum(resourceItems);
    var gap = need - resource;

    return {
      ok: true,
      needItems: needItems,
      resourceItems: resourceItems,
      need: need,
      resource: resource,
      gap: gap,
      sufficient: gap <= 0
    };
  }

  /* ---------------------------------------------------------------------------
     11. 住院日額缺口
     --------------------------------------------------------------------------- */

  function hospitalGap(input) {
    var breakdown = [
      { label: "病房差額／日", value: positive(input.roomDiff) },
      { label: "看護費／日", value: positive(input.caregiver) },
      { label: "收入損失／日", value: positive(input.incomeLoss) }
    ];
    var perDayNeed = breakdown.reduce(function (s, i) {
      return s + i.value;
    }, 0);
    var existing = positive(input.existingDaily);
    var perDayGap = perDayNeed - existing;
    var days = positive(input.estimatedDays) || 1;

    return {
      ok: true,
      breakdown: breakdown,
      perDayNeed: perDayNeed,
      existing: existing,
      perDayGap: perDayGap,
      days: days,
      totalGap: perDayGap * days,
      sufficient: perDayGap <= 0
    };
  }

  /* ---------------------------------------------------------------------------
     12. 實支實付雜費額度
     --------------------------------------------------------------------------- */

  function reimbursementGap(input) {
    var items = [
      { label: "自費藥材／特材", value: positive(input.materials) },
      { label: "自費手術相關", value: positive(input.surgery) },
      { label: "病房升等差額", value: positive(input.room) },
      { label: "其他自費項目", value: positive(input.other) }
    ];
    var total = items.reduce(function (s, i) {
      return s + i.value;
    }, 0);
    var limit = positive(input.limit);

    return {
      ok: true,
      items: items,
      total: total,
      limit: limit,
      gap: total - limit,
      coveredRate: total > 0 ? Math.min(Math.round((limit / total) * 1000) / 10, 100) : 100,
      sufficient: total - limit <= 0
    };
  }

  /* ---------------------------------------------------------------------------
     資料表
     --------------------------------------------------------------------------- */

  // 衛福部國民健康署公費新生兒篩檢 21 項（108 年 10 月 1 日起）
  var NEWBORN_SCREENING = [
    "先天性甲狀腺低能症（CHT）",
    "苯酮尿症（PKU）",
    "高胱胺酸尿症（HCU）",
    "半乳糖血症（GAL）",
    "葡萄糖-6-磷酸鹽脫氫酶缺乏症／蠶豆症（G6PD）",
    "先天性腎上腺增生症（CAH）",
    "楓漿尿症（MSUD）",
    "中鏈醯輔酶A去氫酶缺乏症（MCAD）",
    "戊二酸血症第一型（GA-1）",
    "異戊酸血症（IVA）",
    "甲基丙二酸血症（MMA）",
    "瓜胺酸血症第 I 型",
    "瓜胺酸血症第 II 型",
    "三羥基三甲基戊二酸尿症（HMG）",
    "全羧化酶合成酶缺乏症",
    "丙酸血症（PA）",
    "原發性肉鹼缺乏症（CUD）",
    "肉鹼棕櫚醯基轉移酶缺乏症第 I 型",
    "肉鹼棕櫚醯基轉移酶缺乏症第 II 型",
    "極長鏈醯輔酶A去氫酶缺乏症（VLCAD）",
    "戊二酸血症第二型（GA-2）"
  ];

  var NEWBORN_SCREENING_SELF_PAID = [
    "嚴重複合型免疫缺乏症（SCID）",
    "脊髓性肌肉萎縮症（SMA）",
    "龐貝氏症（Pompe）",
    "高雪氏症（Gaucher）",
    "黏多醣症第一型、第二型（MPS I / II）",
    "法布瑞氏症（Fabry）",
    "生物素酶缺乏症（BD）",
    "腎上腺腦白質失養症（ALD）",
    "裘馨氏肌肉失養症（DMD）",
    "芳香族L-胺基酸類脫羧酶缺乏症（AADC）",
    "聽力篩檢",
    "先天性心臟病篩檢（血氧監測）",
    "新生兒超音波（腦部／腹部／心臟）"
  ];

  // 新生兒常見體況 → 核保傾向。各公司寬嚴差異大，僅供事前評估與徵詢方向。
  var NEWBORN_CONDITIONS = [
    { group: "早產相關", name: "早產（< 37 週）", tendency: "延期", detail: "多數要求滿 6 個月至 1 歲、生長曲線正常後再議", docs: "出生證明、出院病歷摘要、兒童健康手冊生長曲線" },
    { group: "早產相關", name: "低出生體重（< 2500g）", tendency: "延期", detail: "追蹤體重追上百分位後多可正常承保", docs: "兒童健康手冊、健兒門診紀錄" },
    { group: "早產相關", name: "呼吸窘迫症候群（RDS）", tendency: "延期", detail: "需已停氧、無慢性肺病變", docs: "出院病歷摘要、胸部 X 光報告" },
    { group: "早產相關", name: "腦室內出血（IVH）", tendency: "延期／拒保", detail: "依分級，Grade III 以上多拒保", docs: "腦部超音波報告、神經科追蹤紀錄" },
    { group: "黃疸", name: "生理性黃疸", tendency: "正常承保", detail: "消退後多無影響", docs: "通常不需檢附" },
    { group: "黃疸", name: "病理性黃疸／需照光", tendency: "正常或延期", detail: "照光治療已結束、數值正常後多可承保", docs: "膽紅素數值紀錄、出院病歷摘要" },
    { group: "黃疸", name: "換血治療", tendency: "延期", detail: "需完整病歷與後續追蹤", docs: "出院病歷摘要、血液科追蹤紀錄" },
    { group: "心臟", name: "卵圓孔未閉合（PFO）", tendency: "除外／延期", detail: "多要求閉合證明；未閉合常見除外心血管", docs: "心臟超音波報告（含追蹤）" },
    { group: "心臟", name: "開放性動脈導管（PDA）", tendency: "除外／延期", detail: "自行閉合後多可正常承保", docs: "心臟超音波報告" },
    { group: "心臟", name: "心室中膈缺損（VSD）", tendency: "除外／加費／拒保", detail: "依缺損大小與是否需手術而定", docs: "心臟超音波報告、心臟科診斷證明" },
    { group: "心臟", name: "心房中膈缺損（ASD）", tendency: "除外／加費", detail: "小型多可追蹤觀察", docs: "心臟超音波報告" },
    { group: "心臟", name: "心雜音", tendency: "補件後再議", detail: "須先做心臟超音波排除結構異常", docs: "心臟超音波報告" },
    { group: "泌尿腎臟", name: "水腎／腎盂擴張", tendency: "除外", detail: "常見除外泌尿系統，追蹤改善後可申請解除", docs: "腎臟超音波報告、追蹤紀錄" },
    { group: "泌尿腎臟", name: "隱睪", tendency: "除外", detail: "術後追蹤穩定可解除除外", docs: "小兒外科診斷證明" },
    { group: "外科", name: "腹股溝疝氣", tendency: "除外", detail: "術後恢復良好多可解除", docs: "手術紀錄、出院病歷摘要" },
    { group: "外科", name: "臍疝氣", tendency: "除外", detail: "多數 2 歲前自癒", docs: "診斷證明" },
    { group: "外科", name: "唇顎裂", tendency: "除外", detail: "除外口腔顏面相關，其餘可承保", docs: "診斷證明、手術計畫" },
    { group: "骨骼", name: "髖關節發育不良（DDH）", tendency: "除外", detail: "治療完成且追蹤正常可申請解除", docs: "髖關節超音波／X 光報告" },
    { group: "血液代謝", name: "蠶豆症（G6PD 缺乏）", tendency: "多可承保", detail: "部分公司除外溶血相關；屬公告篩檢項目不得拒保", docs: "新生兒篩檢報告" },
    { group: "血液代謝", name: "先天性甲狀腺低下", tendency: "除外", detail: "除外內分泌系統，控制穩定者部分公司可加費承保", docs: "甲狀腺功能檢驗、內分泌科診斷證明" },
    { group: "血液代謝", name: "地中海型貧血（帶因）", tendency: "多可承保", detail: "重型則多拒保", docs: "血液檢驗報告" },
    { group: "皮膚", name: "血管瘤／草莓斑", tendency: "除外", detail: "多數可自行消退，消退後申請解除", docs: "皮膚科診斷證明、照片" },
    { group: "感染住院", name: "新生兒肺炎／敗血症住院", tendency: "延期", detail: "痊癒後觀察 3～6 個月多可承保", docs: "出院病歷摘要" },
    { group: "神經", name: "熱性痙攣／抽搐", tendency: "延期／除外", detail: "需神經科評估排除癲癇", docs: "腦波報告、神經科診斷證明" }
  ];

  // 新生兒核保應備文件檢核清單
  var NEWBORN_DOCS = [
    { key: "birthcert", label: "出生證明書", required: true, note: "載明妊娠週數、出生體重、Apgar 分數、生產方式" },
    { key: "id", label: "戶籍謄本或身分證字號", required: true, note: "須先完成出生登記" },
    { key: "handbook", label: "兒童健康手冊", required: true, note: "出生紀錄、生長曲線百分位、健兒門診、疫苗接種" },
    { key: "screening", label: "21 項公費新生兒篩檢報告", required: true, note: "屬公告項目，異常不得作為拒保或除外理由" },
    { key: "discharge", label: "出院病歷摘要", required: false, note: "曾住 NICU、保溫箱或有住院紀錄者必附" },
    { key: "hearing", label: "聽力篩檢報告", required: false, note: "有異常或需複篩者附上" },
    { key: "echo", label: "心臟超音波報告", required: false, note: "有心雜音、PFO、PDA、VSD、ASD 者必附" },
    { key: "renal", label: "腎臟／腹部超音波報告", required: false, note: "水腎、腎盂擴張者必附" },
    { key: "brain", label: "腦部超音波報告", required: false, note: "早產兒或疑似腦室內出血者必附" },
    { key: "bilirubin", label: "黃疸數值與照光治療紀錄", required: false, note: "病理性黃疸或曾照光者附上" },
    { key: "growth", label: "近期生長曲線百分位", required: false, note: "早產或低體重兒追蹤用" },
    { key: "genetic", label: "染色體／基因檢查報告", required: false, note: "若曾做過相關檢查" },
    { key: "maternal", label: "母親孕產史說明", required: false, note: "妊娠糖尿病、子癲前症、產檢異常等，部分公司會詢問" },
    { key: "followup", label: "最近一次回診追蹤紀錄", required: false, note: "體況件建議一併附上，可加速核保" }
  ];

  // 官方與業界查詢站台
  var EXTERNAL_TOOLS = [
    {
      group: "商品與條款",
      items: [
        { name: "保發中心 保險商品查詢", url: "https://insprod.tii.org.tw/Query.aspx", desc: "條款、費率、商品說明；與業務文件衝突時以此為準" },
        { name: "保險業公開資訊觀測站", url: "https://ins-info.ib.gov.tw/", desc: "各公司財務、業務統計、申訴率、理賠統計" }
      ]
    },
    {
      group: "被保險人資料",
      items: [
        { name: "壽險公會 保險存摺", url: "https://insurtech.lia-roc.org.tw/", desc: "查個人累積投保張數與額度，判斷是否超額" },
        { name: "健保署 健康存摺", url: "https://myhealthbank.nhi.gov.tw/", desc: "就醫、用藥、檢驗檢查紀錄，核對告知事項最關鍵的工具" },
        { name: "全民健保行動快易通", url: "https://www.nhi.gov.tw/ch/np-2702-1.html", desc: "健康存摺行動版申辦說明" }
      ]
    },
    {
      group: "法規",
      items: [
        { name: "保險相關法規查詢系統", url: "https://law.lia-roc.org.tw/", desc: "招攬及核保理賠辦法、核保作業自律規範" },
        { name: "保險業招攬及核保理賠辦法", url: "https://law.lia-roc.org.tw/Law/Content?lsid=FL006828", desc: "核保作業的法源依據" },
        { name: "保險法第 107 條問答集", url: "https://www.lia-roc.org.tw/list_article?article_content=78", desc: "未滿 15 歲身故給付限制的完整說明" },
        { name: "財政部全球資訊網", url: "https://www.mof.gov.tw/", desc: "遺產稅喪葬費扣除額每年公告，連動兒童保額上限" }
      ]
    },
    {
      group: "醫療與新生兒",
      items: [
        { name: "國健署 兒童及青少年 BMI 建議值", url: "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=542&pid=9547", desc: "0–18 歲 BMI 過重／肥胖切點官方表" },
        { name: "國健署 兒童及青少年版 BMI 計算機", url: "https://www.hpa.gov.tw/Obesity/ChildBMI.aspx", desc: "官方百分位計算，未滿 18 歲請以此為準" },
        { name: "國健署 新生兒篩檢專區", url: "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4047&pid=11706", desc: "21 項公費篩檢說明與異常追蹤" },
        { name: "孕產兒關懷網站", url: "https://mammy.hpa.gov.tw/", desc: "生長曲線、健兒門診、疫苗時程" }
      ]
    }
  ];

  return {
    toDate: toDate,
    makeDate: makeDate,
    fmtDate: fmtDate,
    addDays: addDays,
    addMonths: addMonths,
    diffDays: diffDays,
    calendarDiff: calendarDiff,
    isLeapYear: isLeapYear,
    daysInMonth: daysInMonth,

    adToRoc: adToRoc,
    rocToAd: rocToAd,
    convertRocDate: convertRocDate,
    actualAge: actualAge,
    insuranceAge: insuranceAge,
    bmi: bmi,
    correctedAge: correctedAge,
    newbornEligibility: newbornEligibility,
    waitingPeriod: waitingPeriod,
    premiumModes: premiumModes,
    minorDeathCap: minorDeathCap,
    coverageGap: coverageGap,
    hospitalGap: hospitalGap,
    reimbursementGap: reimbursementGap,

    DATA: {
      ADULT_BMI_BANDS: ADULT_BMI_BANDS,
      UW_BMI_BANDS: UW_BMI_BANDS,
      WAITING_PERIODS: WAITING_PERIODS,
      PREMIUM_MODES: PREMIUM_MODES,
      FUNERAL_DEDUCTION_HISTORY: FUNERAL_DEDUCTION_HISTORY,
      NEWBORN_SCREENING: NEWBORN_SCREENING,
      NEWBORN_SCREENING_SELF_PAID: NEWBORN_SCREENING_SELF_PAID,
      NEWBORN_CONDITIONS: NEWBORN_CONDITIONS,
      NEWBORN_DOCS: NEWBORN_DOCS,
      EXTERNAL_TOOLS: EXTERNAL_TOOLS
    },
    VERSION: "1.0.0"
  };
});
