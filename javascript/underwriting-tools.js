/* =============================================================================
   核保工具中心：介面層

   沿用金融工具中心（financial-tools）的版面契約：
     .panel-heading / .panel-tools / .form-grid / .field / .input-wrap /
     .results-grid / .result-card / .subsection / .table-wrap / .tool-tags /
     #tool-nav 的 rail 按鈕 / #result-peek
   因此不需要另外寫一整套樣式，只有核保專屬的元件（傾向標籤、檢核清單）
   放在 underwriting-tools.css。

   本頁 CSP 為 default-src 'self'; style-src 'self'，
   所以這裡產生的 HTML 一律不得出現 inline style 或 inline script。

   所有計算都在 underwriting-core.js，這一層只管畫面與匯出。
   ============================================================================= */
(function () {
  "use strict";

  var C = window.UwCore;
  if (!C) return;

  var DASH = "—";
  var $ = function (id) { return document.getElementById(id); };
  var nf = function (n) { return (Number(n) || 0).toLocaleString("zh-TW"); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var today = function () { return C.fmtDate(new Date()); };

  /* ---------------------------------------------------------------------------
     欄位與結果卡的樣板
     --------------------------------------------------------------------------- */

  function field(id, label, example, suffix, hint, type) {
    var t = type || "number";
    var attrs = t === "number" ? ' type="number" inputmode="decimal"' : ' type="' + t + '"';
    return (
      '<label class="field"><span>' + esc(label) + "</span>" +
      '<div class="input-wrap"><input id="' + id + '"' + attrs +
      ' placeholder="' + esc(example == null ? "" : example) + '" autocomplete="off">' +
      (suffix ? "<b>" + esc(suffix) + "</b>" : "") +
      "</div>" +
      (hint ? "<small>" + esc(hint) + "</small>" : "") +
      "</label>"
    );
  }

  function dateField(id, label, hint) {
    return (
      '<label class="field"><span>' + esc(label) + "</span>" +
      '<div class="input-wrap"><input id="' + id + '" type="date" autocomplete="off"></div>' +
      (hint ? "<small>" + esc(hint) + "</small>" : "") +
      "</label>"
    );
  }

  function selectField(id, label, options, hint) {
    return (
      '<label class="field"><span>' + esc(label) + "</span><select id=\"" + id + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o.value) + '">' + esc(o.label) + "</option>";
      }).join("") +
      "</select>" +
      (hint ? "<small>" + esc(hint) + "</small>" : "") +
      "</label>"
    );
  }

  function checkField(id, label) {
    return (
      '<label class="uw-check"><input type="checkbox" id="' + id + '"><span>' + esc(label) + "</span></label>"
    );
  }

  function card(id, label, note) {
    return (
      '<article class="result-card"><span>' + esc(label) + "</span>" +
      '<strong id="' + id + '">' + DASH + "</strong>" +
      (note ? "<small>" + esc(note) + "</small>" : "") +
      "</article>"
    );
  }

  function heading(eyebrow, title, description) {
    return (
      '<div class="panel-heading"><div><p class="eyebrow">' + esc(eyebrow) + "</p>" +
      "<h2>" + esc(title) + "</h2></div><p>" + esc(description) + "</p></div>" +
      // data-export 是給 analytics.js 的匿名統計用的，命名沿用金融工具中心的慣例
      '<div class="panel-tools">' +
      '<button type="button" class="formula-toggle" data-act="copy" data-export="copy">複製結果</button>' +
      '<button type="button" class="formula-toggle" data-act="csv" data-export="csv">匯出 CSV</button>' +
      '<button type="button" class="formula-toggle" data-act="report" data-export="report">產生報告</button>' +
      '<button type="button" class="formula-toggle" data-act="print" data-export="print">列印</button>' +
      '<span class="export-status" data-status></span></div>'
    );
  }

  function tags(list) {
    return '<div class="tool-tags">' + list.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>";
  }

  function subsection(title, inner) {
    return '<div class="subsection"><h3>' + esc(title) + "</h3>" + inner + "</div>";
  }

  function table(headers, rows, numCols) {
    var nums = numCols || [];
    return (
      '<div class="table-wrap"><table><thead><tr>' +
      headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      rows.map(function (r) {
        var cells = r.cells || r;
        return '<tr class="' + (r.highlight ? "uw-row-total" : "") + '">' +
          cells.map(function (c, i) {
            var cls = nums.indexOf(i) > -1 ? ' class="uw-num"' : "";
            var body = c && typeof c === "object" && c.html !== undefined ? c.html : esc(c);
            return "<td" + cls + ">" + body + "</td>";
          }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>"
    );
  }

  function pill(tone, text) {
    return '<span class="uw-pill uw-' + tone + '">' + esc(text) + "</span>";
  }

  /** 讀值 */
  function val(id) { var n = $(id); return n ? n.value : ""; }
  function num(id) { var v = val(id); return v === "" ? NaN : Number(v); }
  function checked(id) { var n = $(id); return !!(n && n.checked); }
  /** 寫入結果卡 */
  function put(id, text, tone) {
    var n = $(id);
    if (!n) return;
    n.textContent = text == null || text === "" ? DASH : String(text);
    var host = n.closest(".result-card");
    if (host) {
      host.classList.remove("uw-good", "uw-warn", "uw-bad");
      if (tone) host.classList.add("uw-" + tone);
    }
  }
  /** 驗證訊息區 */
  function notice(id, tone, text) {
    var n = $(id);
    if (!n) return;
    n.innerHTML = text ? '<div class="chk ' + (tone === "bad" ? "error" : tone === "warn" ? "warn" : "") + '">' + esc(text) + "</div>" : "";
  }

  /* ---------------------------------------------------------------------------
     七組工作區
     --------------------------------------------------------------------------- */

  var TOOLS = [
    /* ===== 01 投保年齡與日期 ===== */
    {
      id: "age",
      number: "01",
      title: "投保年齡與日期",
      subtitle: "保險年齡・實足年齡・民國換算",
      eyebrow: "AGE & DATE",
      heading: "投保年齡與日期換算",
      description: "保險年齡決定費率級距，差一天就可能差一整歲。這裡同時算出實足年齡、保險年齡，以及維持目前保險年齡的最後投保日。",
      tags: ["保險年齡", "實足年齡", "月齡日齡", "民國西元", "最後投保日"],
      render: function () {
        return (
          heading("AGE & DATE", "投保年齡與日期換算",
            "投保年齡以足歲計算，未滿一歲之零數超過六個月者加算一歲；剛好滿六個月不進位。") +
          tags(this.tags) +
          subsection("保險年齡",
            '<div class="form-grid">' +
            dateField("age-birth", "出生日期") +
            dateField("age-ref", "投保／基準日", "預設今天") +
            "</div>" +
            '<div class="input-check" id="age-notice"></div>' +
            '<div class="results-grid">' +
            card("age-ins", "保險年齡", "費率適用的年齡") +
            card("age-actual", "實足年齡") +
            card("age-deadline", "維持此年齡的最後投保日", "這天含當日仍算目前年齡") +
            card("age-left", "距最後投保日") +
            card("age-bump", "保險年齡跳動日") +
            card("age-rule", "是否進位") +
            "</div>") +
          subsection("實足年齡與月齡",
            '<div class="results-grid">' +
            card("age-months", "總月數") +
            card("age-weeks", "總週數") +
            card("age-days", "總天數") +
            card("age-infant", "嬰幼兒表示法", "填寫兒童險與體況說明用") +
            "</div>") +
          subsection("民國 ⇄ 西元換算",
            '<div class="form-grid">' +
            selectField("roc-mode", "輸入的是", [{ value: "roc", label: "民國年" }, { value: "ad", label: "西元年" }]) +
            field("roc-year", "年", 115) +
            field("roc-month", "月", 8) +
            field("roc-day", "日", 2) +
            "</div>" +
            '<div class="uw-check-row">' + checkField("roc-before", "民國前（1912 年以前）") + "</div>" +
            '<div class="input-check" id="roc-notice"></div>' +
            '<div class="results-grid">' +
            card("roc-out", "民國") +
            card("roc-ad", "西元") +
            card("roc-compact", "要保書格式", "常見於填表欄位") +
            card("roc-week", "星期") +
            "</div>")
        );
      },
      init: function () {
        if (!val("age-ref")) $("age-ref").value = today();
      },
      calc: function () {
        // 保險年齡
        var b = val("age-birth"), r = val("age-ref") || today();
        if (b) {
          var ia = C.insuranceAge(b, r);
          if (!ia.ok) {
            notice("age-notice", "bad", ia.error);
            ["age-ins", "age-actual", "age-deadline", "age-left", "age-bump", "age-rule",
              "age-months", "age-weeks", "age-days", "age-infant"].forEach(function (k) { put(k, ""); });
          } else {
            notice("age-notice", "", "");
            put("age-ins", ia.age + " 歲", "good");
            put("age-actual", ia.actualText);
            put("age-deadline", ia.deadlineText, "warn");
            put("age-left", ia.daysLeft + " 天");
            put("age-bump", ia.bumpDateText + "（→ " + ia.nextAge + " 歲）");
            put("age-rule", ia.rounded ? "已進位 +1 歲" : "未進位");

            var aa = C.actualAge(b, r);
            if (aa.ok) {
              put("age-months", aa.totalMonths + " 個月");
              put("age-weeks", aa.totalWeeks + " 週 " + aa.remainderDaysInWeek + " 天");
              put("age-days", nf(aa.totalDays) + " 天");
              put("age-infant", aa.infantText);
            }
          }
        }

        // 民國換算
        var y = num("roc-year"), m = num("roc-month"), d = num("roc-day");
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          var rc = C.convertRocDate({ mode: val("roc-mode"), year: y, month: m, day: d, before: checked("roc-before") });
          if (!rc.ok) {
            notice("roc-notice", "bad", rc.error);
            ["roc-out", "roc-ad", "roc-compact", "roc-week"].forEach(function (k) { put(k, ""); });
          } else {
            notice("roc-notice", "", "");
            put("roc-out", rc.rocLabel, "good");
            put("roc-ad", rc.ad);
            put("roc-compact", rc.rocCompact);
            put("roc-week", rc.weekday + (rc.isLeap ? "・閏年" : ""));
          }
        }
      }
    },

    /* ===== 02 體位與核保 ===== */
    {
      id: "body",
      number: "02",
      title: "體位與核保",
      subtitle: "BMI・體位加費區間",
      eyebrow: "BODY MASS",
      heading: "BMI 與體位核保評估",
      description: "體位是醫療險最常見的加費與拒保原因之一。這裡同時給出國健署體位分級與業界常見的核保區間。",
      tags: ["BMI", "體位分級", "加費區間", "健康體重"],
      render: function () {
        return (
          heading("BODY MASS", "BMI 與體位核保評估",
            "體位分級採衛福部國民健康署成人標準；核保區間為業界常見做法，不是任何一家公司的正式標準。") +
          tags(this.tags) +
          '<div class="form-grid">' +
          field("bmi-h", "身高", 170, "公分") +
          field("bmi-w", "體重", 65, "公斤") +
          "</div>" +
          '<div class="input-check" id="bmi-notice"></div>' +
          '<div class="results-grid">' +
          card("bmi-val", "BMI") +
          card("bmi-cat", "體位分級", "國健署成人標準") +
          card("bmi-uw", "核保參考區間", "各公司差異大，僅供方向") +
          card("bmi-range", "健康體重範圍") +
          card("bmi-gap", "與健康範圍差距") +
          "</div>" +
          '<div class="input-check"><div class="chk warn"><b>未滿 18 歲請勿使用本表</b>兒童與青少年還在發育，需對照國健署「兒童及青少年生長 BMI 建議值」的百分位切點。請改用官方計算機（見第 07 組「官方查詢工具」）。</div></div>'
        );
      },
      calc: function () {
        var h = num("bmi-h"), w = num("bmi-w");
        if (isNaN(h) || isNaN(w)) return;
        var r = C.bmi(h, w);
        if (!r.ok) {
          notice("bmi-notice", "bad", r.error);
          ["bmi-val", "bmi-cat", "bmi-uw", "bmi-range", "bmi-gap"].forEach(function (k) { put(k, ""); });
          return;
        }
        notice("bmi-notice", "", "");
        put("bmi-val", r.value, r.tone);
        put("bmi-cat", r.category, r.tone);
        put("bmi-uw", r.underwriting, r.underwritingTone);
        put("bmi-range", r.healthyWeightMin + " – " + r.healthyWeightMax + " 公斤");
        put("bmi-gap",
          r.gapToHealthy === 0 ? "已在健康範圍"
            : r.gapToHealthy > 0 ? "尚差 " + r.gapToHealthy + " 公斤"
              : "超出 " + Math.abs(r.gapToHealthy) + " 公斤");
      }
    },

    /* ===== 03 保單條件 ===== */
    {
      id: "policy",
      number: "03",
      title: "保單條件試算",
      subtitle: "等待期・繳費期別・兒童保額上限",
      eyebrow: "POLICY TERMS",
      heading: "保單條件試算",
      description: "等待期什麼時候結束、改月繳一年多付多少、未滿 15 歲的身故給付上限是多少。",
      tags: ["等待期", "保障起日", "繳費期別", "保險法107條"],
      render: function () {
        var wpOpts = C.DATA.WAITING_PERIODS.map(function (w) {
          return { value: w.key, label: w.label + "（" + w.days + " 天）" };
        });
        var fdOpts = C.DATA.FUNERAL_DEDUCTION_HISTORY.map(function (h) {
          return { value: String(h.deduction), label: h.year + "　扣除額 " + nf(h.deduction) };
        });
        return (
          heading("POLICY TERMS", "保單條件試算",
            "等待期天數與期別係數依商品條款可能不同，此處為業界通用值。") +
          tags(this.tags) +
          subsection("等待期與保障起日",
            '<div class="form-grid">' +
            dateField("wp-date", "保單生效日", "預設今天") +
            selectField("wp-type", "險種", wpOpts) +
            field("wp-days", "等待期天數", 30, "天", "可自行覆寫") +
            "</div>" +
            '<div class="results-grid">' +
            card("wp-cover", "保障開始日", "此日起發生的疾病才理賠") +
            card("wp-end", "等待期屆滿日") +
            card("wp-state", "目前狀態") +
            "</div>" +
            '<div class="input-check" id="wp-notice"></div>') +
          subsection("繳費期別換算",
            '<div class="form-grid">' + field("pm-annual", "年繳保費", 36000, "元") + "</div>" +
            '<div class="results-grid">' +
            card("pm-month", "月繳每期") +
            card("pm-extra", "改月繳一年多付") +
            card("pm-rate", "多付比例") +
            "</div>" +
            '<div id="pm-table"></div>') +
          subsection("未滿 15 歲喪葬費用保險金上限",
            '<div class="form-grid">' +
            selectField("mc-year", "年度", fdOpts.concat([{ value: "custom", label: "自行輸入" }])) +
            field("mc-deduction", "遺產稅喪葬費扣除額", 1380000, "元") +
            "</div>" +
            '<div class="results-grid">' +
            card("mc-cap", "喪葬費用保險金上限", "扣除額 ÷ 2") +
            "</div>" +
            '<div class="input-check"><div class="chk"><b>保險法第 107 條</b>未滿 15 歲之被保險人，除喪葬費用給付外，其餘死亡給付於滿 15 歲時始生效力；15 歲前身故僅退還所繳保險費加計利息。扣除額每年由財政部公告，上限會隨之變動。</div></div>')
        );
      },
      init: function () {
        if (!val("wp-date")) $("wp-date").value = today();
        if (!val("wp-days")) $("wp-days").value = 30;
        if (!val("mc-deduction")) $("mc-deduction").value = 1380000;
      },
      onChange: function (target) {
        if (target && target.id === "wp-type") {
          var f = C.DATA.WAITING_PERIODS.filter(function (w) { return w.key === val("wp-type"); })[0];
          if (f) $("wp-days").value = f.days;
        }
        if (target && target.id === "mc-year" && val("mc-year") !== "custom") {
          $("mc-deduction").value = val("mc-year");
        }
      },
      calc: function () {
        // 等待期
        var wp = C.waitingPeriod(val("wp-date"), num("wp-days"));
        if (wp.ok) {
          put("wp-cover", wp.coverFromText, wp.passed ? "good" : "warn");
          put("wp-end", wp.endDateText);
          put("wp-state", wp.passed ? "已通過等待期" : "尚餘 " + wp.remaining + " 天", wp.passed ? "good" : "warn");
          var t = C.DATA.WAITING_PERIODS.filter(function (w) { return w.key === val("wp-type"); })[0];
          notice("wp-notice", "", wp.note + (t && t.alt ? "　" + t.alt : ""));
        }

        // 繳費期別
        var pm = C.premiumModes(num("pm-annual"));
        if (pm.ok) {
          var mo = pm.rows.filter(function (x) { return x.key === "monthly"; })[0];
          put("pm-month", nf(mo.each) + " 元");
          put("pm-extra", nf(mo.extra) + " 元", "warn");
          put("pm-rate", "+" + mo.extraRate + "%");
          $("pm-table").innerHTML = table(
            ["期別", "係數", "每期保費", "年度總額", "較年繳多付", "多付比例"],
            pm.rows.map(function (row) {
              return {
                highlight: row.key === "annual",
                cells: [row.label, row.factor, nf(row.each), nf(row.yearly),
                  row.extra === 0 ? DASH : nf(row.extra), row.extraRate === 0 ? DASH : row.extraRate + "%"]
              };
            }), [1, 2, 3, 4, 5]);
        } else {
          $("pm-table").innerHTML = "";
        }

        // 兒童保額上限
        var mc = C.minorDeathCap(num("mc-deduction"));
        if (mc.ok) put("mc-cap", nf(mc.cap) + " 元", "good");
      }
    },

    /* ===== 04 新生兒投保門檻 ===== */
    {
      id: "newborn-entry",
      number: "04",
      title: "新生兒投保門檻",
      subtitle: "送件條件・矯正年齡",
      eyebrow: "NEWBORN ELIGIBILITY",
      heading: "新生兒投保門檻與矯正年齡",
      description: "一般核保門檻為妊娠滿 37 週、出生體重 2,500 公克以上、已出院且完成出生登記。未達標不代表不能保，多半是延後或轉為體況件。",
      tags: ["妊娠週數", "出生體重", "NICU", "矯正年齡", "早產"],
      render: function () {
        return (
          heading("NEWBORN ELIGIBILITY", "新生兒投保門檻與矯正年齡",
            "檢核送件條件，並依妊娠週數換算早產兒的矯正年齡。") +
          tags(this.tags) +
          subsection("投保門檻檢核",
            '<div class="form-grid">' +
            field("ne-weeks", "妊娠週數", 38, "週") +
            field("ne-weight", "出生體重", 3000, "公克") +
            "</div>" +
            '<div class="uw-check-row">' +
            checkField("ne-id", "已完成出生登記、取得身分證字號") +
            checkField("ne-discharged", "已出院") +
            checkField("ne-nicu", "曾住保溫箱或 NICU") +
            "</div>" +
            '<div class="results-grid">' +
            card("ne-verdict", "送件判定") +
            card("ne-blockers", "未達標項目") +
            "</div>" +
            '<div class="input-check" id="ne-notice"></div>' +
            '<div id="ne-table"></div>') +
          subsection("矯正年齡（早產兒）",
            '<div class="form-grid">' +
            dateField("ca-birth", "出生日期") +
            dateField("ca-ref", "基準日", "預設今天") +
            field("ca-weeks", "妊娠週數", 32, "週") +
            field("ca-days", "加零數天數", 0, "天", "0～6") +
            "</div>" +
            '<div class="input-check" id="ca-notice"></div>' +
            '<div class="results-grid">' +
            card("ca-corrected", "矯正年齡") +
            card("ca-chrono", "實際年齡") +
            card("ca-prem", "早產幅度") +
            card("ca-due", "原預產期") +
            card("ca-still", "是否仍需矯正", "一般用到矯正滿 2 歲") +
            "</div>")
        );
      },
      init: function () {
        if (!val("ca-ref")) $("ca-ref").value = today();
      },
      calc: function () {
        var w = num("ne-weeks"), g = num("ne-weight");
        if (!isNaN(w) && !isNaN(g)) {
          var r = C.newbornEligibility({
            gestWeeks: w, birthWeight: g,
            nicu: checked("ne-nicu"), discharged: checked("ne-discharged"), hasId: checked("ne-id")
          });
          put("ne-verdict", r.verdict, r.tone);
          put("ne-blockers", r.blockers + " 項", r.blockers ? "warn" : "good");
          notice("ne-notice", r.tone === "good" ? "" : r.tone, r.advice);
          $("ne-table").innerHTML = table(
            ["項目", "目前狀況", "一般標準", "判定", "說明"],
            r.items.map(function (i) {
              return [i.label, i.value, i.standard,
                { html: pill(i.pass ? "good" : "bad", i.pass ? "符合" : "未達") }, i.note];
            }));
        }

        var cb = val("ca-birth");
        if (cb) {
          var ca = C.correctedAge(cb, val("ca-ref") || today(), num("ca-weeks"), num("ca-days") || 0);
          if (!ca.ok) {
            notice("ca-notice", "bad", ca.error);
            ["ca-corrected", "ca-chrono", "ca-prem", "ca-due", "ca-still"].forEach(function (k) { put(k, ""); });
          } else {
            notice("ca-notice", "", ca.note);
            put("ca-corrected", ca.correctedText, ca.term ? "good" : "warn");
            put("ca-chrono", ca.chronoText + "（" + nf(ca.chronoDays) + " 天）");
            put("ca-prem", ca.term ? "足月" : Math.floor(ca.prematureDays / 7) + " 週 " + (ca.prematureDays % 7) + " 天");
            put("ca-due", ca.dueDateText);
            put("ca-still", ca.stillCorrecting ? "是" : "否");
          }
        }
      }
    },

    /* ===== 05 新生兒體況與文件 ===== */
    {
      id: "newborn-condition",
      number: "05",
      title: "體況與應備文件",
      subtitle: "核保傾向・文件檢核・篩檢",
      eyebrow: "CONDITIONS & DOCS",
      heading: "新生兒體況與應備文件",
      description: "24 筆常見體況的核保方向與該調哪份報告，加上送件前的文件檢核清單。用來決定先問哪一家、先備哪些資料。",
      tags: ["體況對照", "核保傾向", "應備文件", "21項篩檢", "等待期排除"],
      render: function () {
        return (
          heading("CONDITIONS & DOCS", "新生兒體況與應備文件",
            "各公司寬嚴差異很大，此表整理的是常見方向，不是核保結論。") +
          tags(this.tags) +
          subsection("體況 → 核保傾向對照",
            '<label class="field wide"><span>搜尋體況、症狀或應備文件</span>' +
            '<div class="input-wrap"><input id="cond-q" type="search" placeholder="例如：卵圓孔、水腎、黃疸" autocomplete="off"></div></label>' +
            '<div class="uw-chips" id="cond-chips"></div>' +
            '<div id="cond-table"></div>') +
          subsection("核保應備文件檢核清單",
            '<div class="uw-btn-row">' +
            '<button type="button" class="formula-toggle" id="docs-req">只勾必備</button>' +
            '<button type="button" class="formula-toggle" id="docs-clear">全部清除</button>' +
            "</div>" +
            '<div class="results-grid">' +
            card("docs-req-count", "必備文件") +
            card("docs-all-count", "全部項目") +
            card("docs-state", "送件狀態") +
            "</div>" +
            '<ul class="uw-checklist" id="docs-list"></ul>') +
          subsection("新生兒篩檢與等待期",
            '<div class="input-check"><div class="chk"><b>公告篩檢項目不適用等待期</b>出生 48 小時內採足跟血即可完成 21 項公費篩檢。衛福部公告之篩檢項目疾病，金管會已函令排除等待期，保險公司不得據此拒保、列為除外或拒絕理賠，因此不需要為了投保而延後做篩檢。自費項目建議等待期後再做。</div></div>' +
            '<div class="uw-two-col">' +
            '<div><h4 class="uw-sub">21 項公費篩檢</h4><ol class="uw-list" id="scr-public"></ol></div>' +
            '<div><h4 class="uw-sub">常見自費項目</h4><ol class="uw-list" id="scr-self"></ol></div>' +
            "</div>")
        );
      },
      init: function () { renderConditions(); renderDocs(); renderScreening(); },
      calc: function () { /* 本組沒有數值輸入，內容由 init 與事件更新 */ }
    },

    /* ===== 06 保障缺口 ===== */
    {
      id: "gap",
      number: "06",
      title: "保障缺口分析",
      subtitle: "壽險保額・住院日額・實支實付",
      eyebrow: "COVERAGE GAP",
      heading: "保障缺口分析",
      description: "把需要的錢加總，扣掉已有的保障與可動用資源，差額就是要補的缺口。",
      tags: ["遺屬需求法", "壽險保額", "住院日額", "雜費限額"],
      render: function () {
        return (
          heading("COVERAGE GAP", "保障缺口分析",
            "投資與貸款相關試算請用金融工具中心，這裡只處理保險保障缺口。") +
          tags(this.tags) +
          subsection("壽險保額缺口（遺屬需求法）",
            '<div class="form-grid">' +
            field("cg-living", "家庭年生活費", 800000, "元") +
            field("cg-years", "需扶養年數", 15, "年") +
            field("cg-edu", "子女教育金", 3000000, "元") +
            field("cg-mortgage", "房貸餘額", 5000000, "元") +
            field("cg-funeral", "喪葬及後事費用", 500000, "元") +
            field("cg-debt", "其他負債", 0, "元") +
            "</div>" +
            '<div class="form-grid compact">' +
            field("cg-existing", "既有壽險保額", 3000000, "元") +
            field("cg-assets", "可動用流動資產", 2000000, "元") +
            field("cg-labor", "勞保／團保估計", 1000000, "元") +
            "</div>" +
            '<div class="results-grid">' +
            card("cg-need", "總需求") +
            card("cg-res", "可用資源") +
            card("cg-gap", "保額缺口") +
            "</div>" +
            '<div id="cg-table"></div>') +
          subsection("住院日額缺口",
            '<div class="form-grid">' +
            field("hg-room", "病房差額／日", 3000, "元") +
            field("hg-care", "看護費／日", 2600, "元") +
            field("hg-income", "收入損失／日", 2000, "元") +
            field("hg-existing", "現有日額", 2000, "元") +
            field("hg-days", "預估住院天數", 7, "天") +
            "</div>" +
            '<div class="results-grid">' +
            card("hg-need", "每日需求合計") +
            card("hg-gap", "每日缺口") +
            card("hg-total", "住院期間總缺口") +
            "</div>") +
          subsection("實支實付雜費額度",
            '<div class="form-grid">' +
            field("rg-materials", "自費藥材／特材", 120000, "元") +
            field("rg-surgery", "自費手術相關", 80000, "元") +
            field("rg-room", "病房升等差額", 21000, "元") +
            field("rg-other", "其他自費", 0, "元") +
            field("rg-limit", "保單雜費限額", 150000, "元") +
            "</div>" +
            '<div class="results-grid">' +
            card("rg-total", "自費合計") +
            card("rg-gap", "額度缺口") +
            card("rg-rate", "可覆蓋比例") +
            "</div>")
        );
      },
      calc: function () {
        var cg = C.coverageGap({
          annualLiving: num("cg-living"), supportYears: num("cg-years"), education: num("cg-edu"),
          mortgage: num("cg-mortgage"), funeral: num("cg-funeral"), otherDebt: num("cg-debt"),
          existingCoverage: num("cg-existing"), liquidAssets: num("cg-assets"), laborInsurance: num("cg-labor")
        });
        put("cg-need", nf(cg.need) + " 元");
        put("cg-res", nf(cg.resource) + " 元");
        put("cg-gap", (cg.sufficient ? "已足額，餘裕 " : "尚缺 ") + nf(Math.abs(cg.gap)) + " 元", cg.sufficient ? "good" : "bad");
        var rows = cg.needItems.filter(function (i) { return i.value > 0; }).map(function (i) { return [i.label, nf(i.value)]; })
          .concat([{ highlight: true, cells: ["需求小計", nf(cg.need)] }])
          .concat(cg.resourceItems.filter(function (i) { return i.value > 0; }).map(function (i) { return ["－ " + i.label, nf(i.value)]; }))
          .concat([{ highlight: true, cells: [cg.sufficient ? "餘裕" : "保額缺口", nf(Math.abs(cg.gap))] }]);
        $("cg-table").innerHTML = table(["項目", "金額（元）"], rows, [1]);

        var hg = C.hospitalGap({
          roomDiff: num("hg-room"), caregiver: num("hg-care"), incomeLoss: num("hg-income"),
          existingDaily: num("hg-existing"), estimatedDays: num("hg-days")
        });
        put("hg-need", nf(hg.perDayNeed) + " 元");
        put("hg-gap", (hg.sufficient ? "已覆蓋，多 " : "") + nf(Math.abs(hg.perDayGap)) + " 元", hg.sufficient ? "good" : "bad");
        put("hg-total", nf(Math.abs(hg.totalGap)) + " 元（" + hg.days + " 天）", hg.sufficient ? "good" : "bad");

        var rg = C.reimbursementGap({
          materials: num("rg-materials"), surgery: num("rg-surgery"),
          room: num("rg-room"), other: num("rg-other"), limit: num("rg-limit")
        });
        put("rg-total", nf(rg.total) + " 元");
        put("rg-gap", (rg.sufficient ? "限額足夠，餘 " : "不足 ") + nf(Math.abs(rg.gap)) + " 元", rg.sufficient ? "good" : "bad");
        put("rg-rate", rg.coveredRate + "%", rg.sufficient ? "good" : "warn");
      }
    },

    /* ===== 07 官方查詢工具 ===== */
    {
      id: "official",
      number: "07",
      title: "官方查詢工具",
      subtitle: "保發中心・保險存摺・健康存摺",
      eyebrow: "OFFICIAL SOURCES",
      heading: "官方查詢工具",
      description: "這些站台無法在本頁內計算，只能連過去查。離線時連結仍會顯示，恢復連線後即可開啟。",
      tags: ["保發中心", "公開資訊觀測站", "保險存摺", "健康存摺", "法規查詢"],
      render: function () {
        return (
          heading("OFFICIAL SOURCES", "官方查詢工具",
            "核對條款、投保額度與告知事項時的第一手來源。") +
          tags(this.tags) +
          C.DATA.EXTERNAL_TOOLS.map(function (g) {
            return subsection(g.group,
              '<div class="uw-links">' +
              g.items.map(function (i) {
                return '<a class="uw-link" href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer">' +
                  "<strong>" + esc(i.name) + "</strong><span>" + esc(i.desc) + "</span>" +
                  "<em>" + esc(i.url.replace(/^https:\/\//, "").split("/")[0]) + "</em></a>";
              }).join("") + "</div>");
          }).join("")
        );
      },
      calc: function () { }
    }
  ];

  /* ---------------------------------------------------------------------------
     體況對照表
     --------------------------------------------------------------------------- */

  var condState = { q: "", group: "全部" };

  function tendencyTone(t) {
    if (t.indexOf("拒保") > -1) return "bad";
    if (t.indexOf("延期") > -1 || t.indexOf("除外") > -1 || t.indexOf("加費") > -1) return "warn";
    if (t.indexOf("正常") > -1 || t.indexOf("多可") > -1) return "good";
    return "info";
  }

  function renderConditions() {
    var mount = $("cond-table");
    if (!mount) return;

    var chips = $("cond-chips");
    if (chips && !chips.childElementCount) {
      var groups = ["全部"];
      C.DATA.NEWBORN_CONDITIONS.forEach(function (c) {
        if (groups.indexOf(c.group) === -1) groups.push(c.group);
      });
      chips.innerHTML = groups.map(function (g) {
        return '<button type="button" class="uw-chip' + (g === condState.group ? " active" : "") +
          '" data-group="' + esc(g) + '">' + esc(g) + "</button>";
      }).join("");
    }

    var q = condState.q.trim().toLowerCase();
    var rows = C.DATA.NEWBORN_CONDITIONS.filter(function (c) {
      if (condState.group !== "全部" && c.group !== condState.group) return false;
      if (!q) return true;
      return (c.name + c.detail + c.docs + c.group + c.tendency).toLowerCase().indexOf(q) > -1;
    });

    mount.innerHTML = rows.length
      ? table(["分類", "體況", "常見核保傾向", "說明", "應備文件"],
        rows.map(function (c) {
          return [c.group, c.name, { html: pill(tendencyTone(c.tendency), c.tendency) }, c.detail, c.docs];
        }))
      : '<div class="input-check"><div class="chk">沒有符合的體況，換個關鍵字試試。</div></div>';
  }

  /* ---------------------------------------------------------------------------
     文件檢核清單（勾選狀態存在這台裝置）
     --------------------------------------------------------------------------- */

  var DOC_KEY = "eli-uw-docs";

  function loadDocs() {
    try { return JSON.parse(localStorage.getItem(DOC_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveDocs(v) {
    try { localStorage.setItem(DOC_KEY, JSON.stringify(v)); } catch (e) { /* 隱私模式忽略 */ }
  }

  function renderDocs() {
    var list = $("docs-list");
    if (!list) return;
    var state = loadDocs();
    list.innerHTML = C.DATA.NEWBORN_DOCS.map(function (d) {
      return '<li><label class="uw-check"><input type="checkbox" data-doc="' + d.key + '"' +
        (state[d.key] ? " checked" : "") + '><span class="uw-doc-body">' +
        '<span class="uw-doc-title">' + esc(d.label) +
        pill(d.required ? "bad" : "info", d.required ? "必備" : "視情況") + "</span>" +
        '<span class="uw-doc-note">' + esc(d.note) + "</span></span></label></li>";
    }).join("");
    updateDocs();
  }

  function updateDocs() {
    if (!$("docs-list")) return;
    var state = loadDocs();
    var req = C.DATA.NEWBORN_DOCS.filter(function (d) { return d.required; });
    var reqDone = req.filter(function (d) { return state[d.key]; }).length;
    var allDone = C.DATA.NEWBORN_DOCS.filter(function (d) { return state[d.key]; }).length;
    var done = reqDone === req.length;
    put("docs-req-count", reqDone + " / " + req.length, done ? "good" : "warn");
    put("docs-all-count", allDone + " / " + C.DATA.NEWBORN_DOCS.length);
    put("docs-state", done ? "必備文件已齊，可送件" : "尚缺 " + (req.length - reqDone) + " 項必備文件", done ? "good" : "warn");
  }

  function renderScreening() {
    var mk = function (arr, id) {
      var n = $(id);
      if (n) n.innerHTML = arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
    };
    mk(C.DATA.NEWBORN_SCREENING, "scr-public");
    mk(C.DATA.NEWBORN_SCREENING_SELF_PAID, "scr-self");
  }

  /* ---------------------------------------------------------------------------
     Rail 導覽與面板切換
     --------------------------------------------------------------------------- */

  var active = TOOLS[0].id;
  var searchTerm = "";

  function visibleTools() {
    var q = searchTerm.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(function (t) {
      return (t.title + t.subtitle + t.heading + t.description + t.tags.join("")).toLowerCase().indexOf(q) > -1;
    });
  }

  function renderNav() {
    var nav = $("tool-nav");
    var list = visibleTools();
    if (!list.length) {
      nav.innerHTML = '<p class="rail-empty">找不到符合的工作區</p>';
      return;
    }
    nav.innerHTML = list.map(function (t) {
      var on = t.id === active;
      return '<button type="button" role="tab" data-tool="' + t.id + '" class="' + (on ? "active" : "") +
        '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' +
        "<span>" + t.number + "</span><div><strong>" + esc(t.title) + "</strong><small>" + esc(t.subtitle) + "</small></div></button>";
    }).join("");
    updateRail();
  }

  function updateRail() {
    var nav = $("tool-nav");
    var bar = $("rail-bar");
    if (!nav || !bar) return;
    var max = nav.scrollWidth - nav.clientWidth;
    bar.style.width = (max <= 0 ? 100 : Math.min(100, ((nav.scrollLeft / max) * 100) || 0) * 0.7 + 30) + "%";
  }

  function currentTool() {
    return TOOLS.filter(function (t) { return t.id === active; })[0] || TOOLS[0];
  }

  function selectTool(id, focus) {
    active = id;
    var tool = currentTool();
    var area = $("calculator");
    area.innerHTML = tool.render();
    if (tool.init) tool.init();
    tool.calc();
    renderNav();
    updatePeek();
    if (focus) area.focus();
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// 下忽略 */ }
  }

  function recalc(target) {
    var tool = currentTool();
    if (tool.onChange) tool.onChange(target);
    tool.calc();
    updatePeek();
  }

  /** 把第一張結果卡同步到底部的浮動結果條 */
  function updatePeek() {
    var peek = $("result-peek");
    if (!peek) return;
    var card = document.querySelector("#calculator .result-card strong");
    if (!card || card.textContent === DASH) {
      peek.setAttribute("aria-hidden", "true");
      peek.innerHTML = "";
      return;
    }
    var host = card.closest(".result-card");
    peek.setAttribute("aria-hidden", "false");
    peek.innerHTML = "<span>" + esc(host.querySelector("span").textContent) + "</span><strong>" + esc(card.textContent) + "</strong>";
  }

  /* ---------------------------------------------------------------------------
     匯出：複製、CSV、報告、列印
     --------------------------------------------------------------------------- */

  function status(msg) {
    var n = document.querySelector("#calculator [data-status]");
    if (!n) return;
    n.textContent = msg;
    setTimeout(function () { if (n.textContent === msg) n.textContent = ""; }, 2600);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function download(filename, content, mime, bom) {
    var blob = new Blob(bom ? ["﻿", content] : [content], { type: mime + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** 收集目前面板的輸入與結果 */
  function collect() {
    var area = $("calculator");
    var inputs = [];
    Array.prototype.forEach.call(area.querySelectorAll("input, select"), function (n) {
      if (n.type === "search" || n.dataset.doc) return;
      var label = n.closest("label");
      var name = label && label.querySelector("span") ? label.querySelector("span").textContent : n.id;
      if (n.type === "checkbox") { if (n.checked) inputs.push([name, "是"]); }
      else if (n.value !== "") {
        inputs.push([name, n.tagName === "SELECT" && n.selectedOptions[0] ? n.selectedOptions[0].textContent : n.value]);
      }
    });
    var results = [];
    Array.prototype.forEach.call(area.querySelectorAll(".result-card"), function (c) {
      var v = c.querySelector("strong").textContent;
      if (v && v !== DASH) results.push([c.querySelector("span").textContent, v]);
    });
    return { inputs: inputs, results: results };
  }

  function asText() {
    var t = currentTool();
    var d = collect();
    var lines = ["【" + t.heading + "】", ""];
    if (d.inputs.length) {
      lines.push("輸入條件");
      d.inputs.forEach(function (r) { lines.push("　" + r[0] + "：" + r[1]); });
      lines.push("");
    }
    if (d.results.length) {
      lines.push("試算結果");
      d.results.forEach(function (r) { lines.push("　" + r[0] + "：" + r[1]); });
      lines.push("");
    }
    lines.push("— EliNotebook 核保工具中心　" + new Date().toLocaleString("zh-TW"));
    lines.push("本結果為投保前初步評估，不等於保險公司的核保決定。");
    return lines.join("\n");
  }

  function exportCsv() {
    var t = currentTool();
    var rows = [["EliNotebook 核保工具中心"], [t.heading], ["產生時間", new Date().toLocaleString("zh-TW")], []];
    var d = collect();
    if (d.inputs.length) { rows.push(["輸入條件", ""]); d.inputs.forEach(function (r) { rows.push(r); }); rows.push([]); }
    if (d.results.length) { rows.push(["試算結果", ""]); d.results.forEach(function (r) { rows.push(r); }); rows.push([]); }

    // 表格類面板連同資料表一起匯出
    Array.prototype.forEach.call($("calculator").querySelectorAll(".table-wrap table"), function (tb) {
      rows.push([]);
      Array.prototype.forEach.call(tb.querySelectorAll("tr"), function (tr) {
        rows.push(Array.prototype.map.call(tr.children, function (td) { return td.textContent.trim(); }));
      });
    });
    if (t.id === "newborn-condition") {
      rows.push([], ["應備文件", "必要性", "已備齊", "說明"]);
      var st = loadDocs();
      C.DATA.NEWBORN_DOCS.forEach(function (dd) {
        rows.push([dd.label, dd.required ? "必備" : "視情況", st[dd.key] ? "V" : "", dd.note]);
      });
      rows.push([], ["21 項公費篩檢"]);
      C.DATA.NEWBORN_SCREENING.forEach(function (s, i) { rows.push([i + 1, s]); });
      rows.push([], ["常見自費項目"]);
      C.DATA.NEWBORN_SCREENING_SELF_PAID.forEach(function (s, i) { rows.push([i + 1, s]); });
    }

    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n");
    download("核保試算-" + t.title + "-" + stamp() + ".csv", csv, "text/csv", true);
    status("已匯出 CSV");
  }

  /** 自帶樣式的獨立 HTML 報告，可離線開啟或再存成 PDF */
  function buildReport() {
    var t = currentTool();
    var d = collect();
    var area = $("calculator");
    var tablesHtml = Array.prototype.map.call(area.querySelectorAll(".table-wrap"), function (w) {
      return w.outerHTML;
    }).join("");
    var now = new Date();

    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>核保試算報告－" + esc(t.title) + "</title><style>" +
      ":root{--ink:#2b2f31;--muted:#4f4b46;--line:#c3bdb2;--paper:#e9e5de;--surface:#f3f0ea;--alt:#ded9d1;--green:#444e45;--good:#4b574d;--warn:#724a42}" +
      "*{box-sizing:border-box}body{margin:0;padding:2rem 1.25rem 4rem;background:var(--paper);color:var(--ink);" +
      'font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;line-height:1.65}' +
      ".wrap{max-width:900px;margin:0 auto}" +
      "header{border-bottom:2px solid var(--green);padding-bottom:.8rem;margin-bottom:1.6rem}" +
      "h1{margin:0 0 .2rem;font-size:1.35rem}header p{margin:0;color:var(--muted);font-size:.82rem}" +
      "section{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--green);" +
      "border-radius:10px;padding:1rem 1.1rem;margin-bottom:1rem;page-break-inside:avoid}" +
      "h2{margin:0 0 .7rem;font-size:1rem}" +
      "table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.6rem}" +
      "th,td{padding:.4rem .6rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}" +
      "thead th{background:var(--alt)}td.uw-num{text-align:right}" +
      "table.kv th{width:45%;font-weight:500;color:var(--muted)}table.kv td{text-align:right}" +
      ".uw-pill{display:inline-block;padding:.1rem .5rem;border-radius:999px;font-size:.72rem;border:1px solid var(--line)}" +
      "footer{margin-top:2rem;padding:.9rem 1rem;border-radius:9px;background:#f0e6d5;border-left:3px solid #776746;font-size:.78rem}" +
      "@media print{body{background:#fff;padding:0}}" +
      "</style></head><body><div class=\"wrap\"><header><h1>核保試算報告</h1>" +
      "<p>" + esc(t.heading) + "　·　" + esc(now.toLocaleString("zh-TW")) + "　·　EliNotebook 核保工具中心</p></header>" +
      (d.inputs.length ? '<section><h2>輸入條件</h2><table class="kv"><tbody>' +
        d.inputs.map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") +
        "</tbody></table></section>" : "") +
      (d.results.length ? '<section><h2>試算結果</h2><table class="kv"><tbody>' +
        d.results.map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td><strong>" + esc(r[1]) + "</strong></td></tr>"; }).join("") +
        "</tbody></table></section>" : "") +
      (tablesHtml ? "<section><h2>明細</h2>" + tablesHtml + "</section>" : "") +
      "<footer><strong>聲明</strong>：本報告為投保前的初步試算，不等於保險公司的核保決定，也不構成醫療、法律或財務建議。" +
      "實際年齡認定、等待期、期別係數與保額上限以各商品條款、要保書及主管機關公告為準；體況件請先向保險公司做事先徵詢（預核保）。</footer>" +
      "</div></body></html>";
  }

  function copyText() {
    var text = asText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { status("已複製結果"); }, fallbackCopy);
    } else fallbackCopy();

    function fallbackCopy() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.className = "uw-offscreen";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); status("已複製結果"); }
      catch (e) { status("複製失敗，請手動選取"); }
      document.body.removeChild(ta);
    }
  }

  /* ---------------------------------------------------------------------------
     事件
     --------------------------------------------------------------------------- */

  function bind() {
    // rail 切換
    $("tool-nav").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-tool]");
      if (btn) selectTool(btn.dataset.tool, true);
    });
    $("tool-nav").addEventListener("scroll", updateRail, { passive: true });
    window.addEventListener("resize", updateRail);

    Array.prototype.forEach.call(document.querySelectorAll(".rail-arrow"), function (b) {
      b.addEventListener("click", function () {
        var list = visibleTools();
        var idx = list.findIndex(function (t) { return t.id === active; });
        var next = list[Math.min(Math.max(idx + Number(b.dataset.dir), 0), list.length - 1)];
        if (next) selectTool(next.id, true);
      });
    });

    // 工具搜尋
    $("tool-search").addEventListener("input", function (e) {
      searchTerm = e.target.value;
      var list = visibleTools();
      if (list.length && !list.some(function (t) { return t.id === active; })) {
        selectTool(list[0].id, false);
      } else renderNav();
    });

    // 面板內的所有互動
    var area = $("calculator");
    area.addEventListener("input", function (e) {
      if (e.target.id === "cond-q") { condState.q = e.target.value; renderConditions(); return; }
      recalc(e.target);
    });
    area.addEventListener("change", function (e) {
      if (e.target.dataset && e.target.dataset.doc) {
        var st = loadDocs();
        st[e.target.dataset.doc] = e.target.checked;
        saveDocs(st);
        updateDocs();
        return;
      }
      recalc(e.target);
    });
    area.addEventListener("click", function (e) {
      var chip = e.target.closest(".uw-chip");
      if (chip) {
        condState.group = chip.dataset.group;
        Array.prototype.forEach.call($("cond-chips").querySelectorAll(".uw-chip"), function (c) {
          c.classList.toggle("active", c === chip);
        });
        renderConditions();
        return;
      }
      if (e.target.id === "docs-req") {
        var st = {};
        C.DATA.NEWBORN_DOCS.forEach(function (d) { if (d.required) st[d.key] = true; });
        saveDocs(st);
        renderDocs();
        return;
      }
      if (e.target.id === "docs-clear") { saveDocs({}); renderDocs(); return; }

      var act = e.target.closest("[data-act]");
      if (!act) return;
      var a = act.dataset.act;
      if (a === "copy") copyText();
      else if (a === "csv") exportCsv();
      else if (a === "report") {
        download("核保試算報告-" + currentTool().title + "-" + stamp() + ".html", buildReport(), "text/html");
        status("報告已下載，可直接開啟或存成 PDF");
      } else if (a === "print") window.print();
    });
  }

  /* ---------------------------------------------------------------------------
     啟動
     --------------------------------------------------------------------------- */

  function init() {
    if (!$("tool-nav") || !$("calculator")) return;
    var hash = (location.hash || "").slice(1);
    if (hash && TOOLS.some(function (t) { return t.id === hash; })) active = hash;
    bind();
    selectTool(active, false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
