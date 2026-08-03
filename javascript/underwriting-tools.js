/* =============================================================================
   核保工具中心：介面層

   沿用金融工具中心（financial-tools）的版面契約：
     .panel-heading / .panel-tools / .form-grid / .field / .input-wrap /
     .results-grid / .result-card / .subsection / .table-wrap / .tool-tags /
     #tool-nav 的 rail 按鈕 / #result-peek
   因此不需要另外寫一整套樣式，只有核保專屬的元件（傾向標籤、檢核清單、
   名詞解釋）放在 underwriting-tools.css。

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
      '<label class="field"><span>' + esc(label) + '</span><select id="' + id + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o.value) + '">' + esc(o.label) + "</option>";
      }).join("") +
      "</select>" +
      (hint ? "<small>" + esc(hint) + "</small>" : "") +
      "</label>"
    );
  }

  function checkField(id, label, hint) {
    return (
      '<label class="uw-check"><input type="checkbox" id="' + id + '">' +
      '<span class="uw-doc-body"><span>' + esc(label) + "</span>" +
      (hint ? '<span class="uw-doc-note">' + esc(hint) + "</span>" : "") +
      "</span></label>"
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

  var FORMATS = [
    { value: "txt", label: "純文字（.txt）" },
    { value: "md", label: "Markdown（.md）" },
    { value: "csv", label: "CSV（.csv，Excel 可開）" },
    { value: "xls", label: "Excel 試算表（.xls）" },
    { value: "doc", label: "Word 文件（.doc）" },
    { value: "html", label: "網頁報告（.html）" },
    { value: "json", label: "JSON 原始資料（.json）" }
  ];

  function heading(eyebrow, title, description) {
    // data-export 是給 analytics.js 的匿名統計用的，命名沿用金融工具中心的慣例
    return (
      '<div class="panel-heading"><div><p class="eyebrow">' + esc(eyebrow) + "</p>" +
      "<h2>" + esc(title) + "</h2></div><p>" + esc(description) + "</p></div>" +
      '<div class="panel-tools">' +
      '<button type="button" class="formula-toggle" data-act="copy" data-export="copy">複製結果</button>' +
      '<label class="uw-format"><span>匯出格式</span><select id="export-format">' +
      FORMATS.map(function (f) { return '<option value="' + f.value + '">' + esc(f.label) + "</option>"; }).join("") +
      "</select></label>" +
      '<button type="button" class="formula-toggle" data-act="download" data-export="download">下載</button>' +
      '<button type="button" class="formula-toggle" data-act="print" data-export="print">列印 / 存 PDF</button>' +
      '<span class="export-status" data-status></span></div>'
    );
  }

  function tags(list) {
    return '<div class="tool-tags">' + list.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>";
  }

  function subsection(title, inner) {
    return '<div class="subsection"><h3>' + esc(title) + "</h3>" + inner + "</div>";
  }

  /** 名詞解釋。每組工作區都有，讓不熟核保用語的人也看得懂欄位在問什麼。 */
  function glossary(items) {
    return subsection("名詞解釋",
      '<dl class="uw-gloss">' +
      items.map(function (i) {
        return "<dt>" + esc(i[0]) + "</dt><dd>" + esc(i[1]) + "</dd>";
      }).join("") +
      "</dl>");
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

  function val(id) { var n = $(id); return n ? n.value : ""; }
  function num(id) { var v = val(id); return v === "" ? NaN : Number(v); }
  function checked(id) { var n = $(id); return !!(n && n.checked); }

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

  function notice(id, tone, text) {
    var n = $(id);
    if (!n) return;
    n.innerHTML = text
      ? '<div class="chk ' + (tone === "bad" ? "error" : tone === "warn" ? "warn" : "") + '">' + esc(text) + "</div>"
      : "";
  }

  /* 五種核保結果，多個面板共用 */
  var UW_RESULT_GLOSSARY = [
    ["正常承保", "以標準費率承保，跟一般健康的人一樣，沒有額外條件。"],
    ["加費承保", "體況風險較高，在標準保費之外加收一定百分比（業界稱 EM，Extra Mortality）。例如加費 50%，原本 1 萬的保費就變 1.5 萬。"],
    ["除外承保", "特定部位或特定疾病不在保障範圍，其餘照常理賠。例如「除外泌尿系統」，將來因水腎住院不賠，但其他疾病照賠。多數除外在體況改善並追蹤穩定後可申請解除。"],
    ["延期（暫緩）", "暫時不受理，要等一段時間或體況穩定後再送件。不是拒保，不會留下拒保紀錄。"],
    ["拒保", "不接受投保。這會留下紀錄，其他公司的要保書也會問到，所以體況件務必先做事先徵詢。"],
    ["事先徵詢（預核保）", "正式送件前，先把體況與醫療報告給保險公司評估，問他們願不願意承保、條件是什麼。因為不是正式要保，即使結果不理想也不會留下拒保紀錄。"],
    ["標準體／次標準體", "標準體是不必加費的一般費率；次標準體是因體況或體位風險較高，需要加費或除外才能承保。"]
  ];

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
            dateField("age-birth", "出生日期", "被保險人的出生年月日，以身分證或出生證明為準。") +
            dateField("age-ref", "投保日（基準日）",
              "保險公司用來認定保險年齡的那一天，多數公司以「要保書填寫日」為準，少數以「保單生效日」計算，送件前可先確認。預設今天；想試算未來某天的年齡也可以直接改這一欄。") +
            "</div>" +
            '<div class="input-check" id="age-notice"></div>' +
            '<div class="results-grid">' +
            card("age-ins", "保險年齡", "保險公司算保費用的年齡") +
            card("age-actual", "實足年齡", "一般生活上講的年齡") +
            card("age-deadline", "最後投保日", "這天含當日送件，保險年齡不變") +
            card("age-left", "距最後投保日") +
            card("age-bump", "保險年齡跳動日", "這天起會多算一歲，保費往上跳一級") +
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
            selectField("roc-mode", "輸入的是",
              [{ value: "roc", label: "民國年" }, { value: "ad", label: "西元年" }],
              "選民國就填 115，選西元就填 2026。") +
            field("roc-year", "年", 115, "", "民國 = 西元 − 1911。") +
            field("roc-month", "月", 8, "", "填 1～12。") +
            field("roc-day", "日", 2, "", "會檢查日期是否真的存在，例如平年 2 月 29 日會擋下。") +
            "</div>" +
            '<div class="uw-check-row">' +
            checkField("roc-before", "民國前（1912 年以前）", "民國元年是 1912 年。1911 年（含）以前出生者才需要勾這個。") +
            "</div>" +
            '<div class="input-check" id="roc-notice"></div>' +
            '<div class="results-grid">' +
            card("roc-out", "民國") +
            card("roc-ad", "西元") +
            card("roc-compact", "要保書格式", "民國年三位數＋月＋日") +
            card("roc-week", "星期") +
            "</div>") +
          glossary([
            ["保險年齡", "保險公司計算保費用的年齡，不是實足年齡。規則是「以足歲計算，未滿一歲之零數超過六個月者加算一歲」。例如實足 30 歲又 7 個月，保險年齡是 31 歲；實足 30 歲又 6 個月整則仍是 30 歲。"],
            ["投保日（基準日）", "認定保險年齡的基準日。多數保險公司以「要保書填寫日」為準，部分以「保單生效日」計算，兩者可能差好幾天，跨到生日附近時要特別留意。"],
            ["最後投保日", "在這一天（含當天）以前送件，保險年齡還是現在這個數字。過了這天就會多一歲，保費跟著往上跳一級。年紀越大跳一歲的保費差距越明顯。"],
            ["實足年齡", "一般生活上講的年齡，也就是過了幾次生日。"],
            ["要保書格式", "民國年寫成三位數，再接月與日，例如 115.08.02。很多要保書欄位只留這個格式的空格。"]
          ])
        );
      },
      init: function () { if (!val("age-ref")) $("age-ref").value = today(); },
      calc: function () {
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
          field("bmi-h", "身高", 170, "公分", "以要保書填寫或體檢實測為準。核保會比對兩者，落差太大會被要求說明。") +
          field("bmi-w", "體重", 65, "公斤", "短期內體重大幅變化（半年內增減超過 5 公斤）通常要在告知事項說明原因。") +
          "</div>" +
          '<div class="input-check" id="bmi-notice"></div>' +
          '<div class="results-grid">' +
          card("bmi-val", "BMI", "體重 ÷ 身高平方") +
          card("bmi-cat", "體位分級", "國健署成人標準") +
          card("bmi-uw", "核保參考區間", "各公司差異大，僅供方向") +
          card("bmi-range", "健康體重範圍", "BMI 18.5～24 對應的體重") +
          card("bmi-gap", "與健康範圍差距") +
          "</div>" +
          '<div class="input-check"><div class="chk warn"><b>未滿 18 歲請勿使用本表</b>兒童與青少年還在發育，同一個 BMI 在不同年齡代表的意義完全不同，必須對照國健署「兒童及青少年生長 BMI 建議值」的百分位切點。請改用官方計算機（見第 07 組「官方查詢工具」）。</div></div>' +
          glossary([
            ["BMI（身體質量指數）", "體重（公斤）÷ 身高（公尺）的平方。是體位評估最通用的指標，但它看不出肌肉與脂肪的差別，肌肉量高的人可能算出偏高的數字。"],
            ["體位加費", "BMI 過高或過低時，保險公司在標準保費之外加收的費用。醫療險與壽險的加費門檻不同，醫療險通常更嚴格。"],
            ["標準體", "不需要加費也不需要除外，以一般費率承保。"],
            ["次標準體", "體況或體位的風險高於一般人，需要加費、除外或兩者並用才能承保。"],
            ["EM（Extra Mortality）", "加費倍數的業界說法。EM150 代表以標準保費的 150% 收費，也就是加費 50%。"],
            ["體檢件", "保額或年齡達到一定門檻時，保險公司會要求到指定醫院做體檢再核保。體位異常常是觸發體檢的原因之一。"]
          ])
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
            dateField("wp-date", "保單生效日",
              "契約開始的那一天，不是要保書填寫日。通常是保險公司同意承保並收到首期保費之後，保單上會載明。") +
            selectField("wp-type", "險種", wpOpts, "選了會自動帶入常見天數，仍可在右欄自行覆寫。") +
            field("wp-days", "等待期天數", 30, "天", "以保單條款寫的為準。條款通常出現在「疾病」定義那一條。") +
            "</div>" +
            '<div class="results-grid">' +
            card("wp-cover", "保障開始日", "這天起發生的疾病才理賠") +
            card("wp-end", "等待期屆滿日") +
            card("wp-state", "目前狀態") +
            "</div>" +
            '<div class="input-check" id="wp-notice"></div>') +
          subsection("繳費期別換算",
            '<div class="form-grid">' +
            field("pm-annual", "年繳保費", 36000, "元", "建議書上「年繳」那一欄的金額。") +
            "</div>" +
            '<div class="results-grid">' +
            card("pm-month", "月繳每期") +
            card("pm-extra", "改月繳一年多付") +
            card("pm-rate", "多付比例") +
            "</div>" +
            '<div id="pm-table"></div>') +
          subsection("未滿 15 歲喪葬費用保險金上限",
            '<div class="form-grid">' +
            selectField("mc-year", "年度", fdOpts.concat([{ value: "custom", label: "自行輸入" }]),
              "扣除額每年由財政部公告，選年度會自動帶入。") +
            field("mc-deduction", "遺產稅喪葬費扣除額", 1380000, "元", "遺產及贈與稅法第 17 條的定額扣除額。") +
            "</div>" +
            '<div class="results-grid">' +
            card("mc-cap", "喪葬費用保險金上限", "扣除額 ÷ 2") +
            "</div>") +
          glossary([
            ["保單生效日", "契約正式開始的那一天，保障從這天起算。它不等於要保書填寫日 —— 中間要經過核保、同意承保、收取首期保費，可能相差數天到數週。"],
            ["等待期（觀察期）", "從保單生效日起算的一段期間，這期間內「因疾病」發生的事故不理賠。目的是防止已經生病才去投保。一般疾病多為 30 天，癌症與重大傷病常見 90 天。"],
            ["保障開始日", "等待期屆滿的「次日」。例如 8/2 生效、等待期 30 天，9/1 是屆滿日，9/2 起發生的疾病才在保障範圍。"],
            ["意外沒有等待期", "傷害險（意外險）保障的是突發外來事故，不存在帶病投保的問題，所以生效當日就有保障。"],
            ["期別係數", "把年繳保費換算成其他繳別的乘數。業界通用：年繳 1.00、半年繳 0.52、季繳 0.262、月繳 0.088。分期繳付的年度總額一定高於年繳，等於保險公司收取的資金成本。"],
            ["喪葬費用保險金", "未滿 15 歲的被保險人身故時，唯一可以給付的死亡保險金項目。保險法第 107 條規定其上限為遺產稅喪葬費扣除額的一半，其餘死亡給付要等滿 15 歲才生效，15 歲前身故只退還所繳保費加計利息。"]
          ])
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
        var wp = C.waitingPeriod(val("wp-date"), num("wp-days"));
        if (wp.ok) {
          put("wp-cover", wp.coverFromText, wp.passed ? "good" : "warn");
          put("wp-end", wp.endDateText);
          put("wp-state", wp.passed ? "已通過等待期" : "尚餘 " + wp.remaining + " 天", wp.passed ? "good" : "warn");
          var t = C.DATA.WAITING_PERIODS.filter(function (w) { return w.key === val("wp-type"); })[0];
          notice("wp-notice", "", wp.note + (t && t.alt ? "　" + t.alt : ""));
        }

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
            field("ne-weeks", "妊娠週數", 38, "週", "出生時的懷孕週數，出生證明上會寫。足月是 37～42 週。") +
            field("ne-weight", "出生體重", 3000, "公克", "出生當下的體重，不是現在的體重。") +
            "</div>" +
            '<div class="uw-check-row">' +
            checkField("ne-id", "已完成出生登記、取得身分證字號", "要保書一定要填身分證字號，沒有就無法送件。") +
            checkField("ne-discharged", "已出院", "住院中無法投保，須待出院且狀況穩定。") +
            checkField("ne-nicu", "曾住保溫箱或 NICU", "NICU 是新生兒加護病房。住過就要檢附出院病歷摘要，核保會逐項看住院原因。") +
            "</div>" +
            '<div class="results-grid">' +
            card("ne-verdict", "送件判定") +
            card("ne-blockers", "未達標項目") +
            "</div>" +
            '<div class="input-check" id="ne-notice"></div>' +
            '<div id="ne-table"></div>') +
          subsection("矯正年齡（早產兒）",
            '<div class="form-grid">' +
            dateField("ca-birth", "出生日期", "寶寶實際出生的那一天，不是預產期。") +
            dateField("ca-ref", "基準日", "要算到哪一天為止，預設今天。") +
            field("ca-weeks", "妊娠週數", 32, "週", "出生時的懷孕週數。") +
            field("ca-days", "加零數天數", 0, "天", "例如 32 週又 3 天就填 3。範圍 0～6。") +
            "</div>" +
            '<div class="input-check" id="ca-notice"></div>' +
            '<div class="results-grid">' +
            card("ca-corrected", "矯正年齡", "評估發育時要用這個") +
            card("ca-chrono", "實際年齡", "從出生日算起") +
            card("ca-prem", "早產幅度") +
            card("ca-due", "原預產期") +
            card("ca-still", "是否仍需矯正", "一般用到矯正滿 2 歲") +
            "</div>") +
          glossary([
            ["妊娠週數（GA）", "出生時的懷孕週數，從最後一次月經第一天算起。滿 37 週到未滿 42 週稱足月，未滿 37 週是早產。出生證明與媽媽手冊上都查得到。"],
            ["低出生體重", "出生體重未滿 2,500 公克。未滿 1,500 公克稱極低出生體重，未滿 1,000 公克稱超低出生體重，核保寬嚴依此分級。"],
            ["NICU", "新生兒加護病房（Neonatal Intensive Care Unit）。住過 NICU 一定會被核保追問原因，需檢附出院病歷摘要。"],
            ["保溫箱", "維持體溫用的保育器。單純因體溫或體重觀察住幾天，跟因併發症住 NICU，核保的看法差很多，病歷摘要要寫清楚。"],
            ["矯正年齡", "早產兒的評估年齡，公式是實際年齡減去早產的週數。例如 32 週出生（早產 8 週）、實際 6 個月大，矯正年齡約 4 個月。評估生長曲線與發展里程碑時要用矯正年齡，不然會誤判成發育遲緩。一般用到矯正滿 2 歲。"],
            ["原預產期", "如果足月 40 週出生的話會是哪一天。矯正年齡就是從這一天開始算的。"],
            ["生長曲線百分位", "把孩子的身高、體重、頭圍和同齡同性別的孩子比較，得到的排序位置。核保看的是有沒有持續偏離，而不是單次落在第幾百分位。"]
          ])
        );
      },
      init: function () { if (!val("ca-ref")) $("ca-ref").value = today(); },
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
            '<div class="input-wrap"><input id="cond-q" type="search" placeholder="例如：卵圓孔、水腎、黃疸" autocomplete="off"></div>' +
            "<small>可搜體況名稱，也可以搜「超音波」找出所有需要該項報告的體況。</small></label>" +
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
            "</div>") +
          glossary(UW_RESULT_GLOSSARY.concat([
            ["公費篩檢 vs 自費篩檢", "公費是衛福部公告、健保給付的 21 項先天性代謝異常疾病；自費是家長自行加做的擴大項目（如 SMA、SCID、龐貝氏症、聽力、心臟超音波）。兩者在核保上的待遇不同 —— 只有公告項目享有等待期排除的保障。"],
            ["出院病歷摘要", "住院期間的完整摘要，載明入院原因、診斷、處置與出院狀況。核保看體況件時最重視這一份，比診斷證明書資訊量大得多。"],
            ["解除除外", "被除外的部位或疾病，在治療完成並追蹤一段時間都正常後，可以檢附最新報告向保險公司申請把除外條款拿掉。不是每家都受理，投保前可以先問。"]
          ]))
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
            field("cg-living", "家庭年生活費", 800000, "元", "扣掉被保險人自己的花費後，家人一年需要的生活開銷。") +
            field("cg-years", "需扶養年數", 15, "年", "算到最小的孩子經濟獨立，或配偶可自立為止。") +
            field("cg-edu", "子女教育金", 3000000, "元", "從現在到大學畢業的學費與生活費總和。") +
            field("cg-mortgage", "房貸餘額", 5000000, "元", "目前尚未清償的本金。已有房貸壽險的話這欄可填 0。") +
            field("cg-funeral", "喪葬及後事費用", 500000, "元", "一般抓 50 萬上下。") +
            field("cg-debt", "其他負債", 0, "元", "車貸、信貸、就學貸款等。") +
            "</div>" +
            '<div class="form-grid compact">' +
            field("cg-existing", "既有壽險保額", 3000000, "元", "所有壽險的身故保額加總，可從保險存摺查。") +
            field("cg-assets", "可動用流動資產", 2000000, "元", "現金、定存、隨時可變現的投資。不動產通常不算。") +
            field("cg-labor", "勞保／團保估計", 1000000, "元", "勞保死亡給付與公司團保的粗估金額。") +
            "</div>" +
            '<div class="results-grid">' +
            card("cg-need", "總需求") +
            card("cg-res", "可用資源") +
            card("cg-gap", "保額缺口") +
            "</div>" +
            '<div id="cg-table"></div>') +
          subsection("住院日額缺口",
            '<div class="form-grid">' +
            field("hg-room", "病房差額／日", 3000, "元", "健保病房與想住的雙人房或單人房之間的價差。") +
            field("hg-care", "看護費／日", 2600, "元", "全日看護目前行情約 2,600～3,000 元。") +
            field("hg-income", "收入損失／日", 2000, "元", "住院期間無法工作而少賺的錢。") +
            field("hg-existing", "現有日額", 2000, "元", "既有住院日額保險的每日給付總和。") +
            field("hg-days", "預估住院天數", 7, "天", "想模擬的住院長度。") +
            "</div>" +
            '<div class="results-grid">' +
            card("hg-need", "每日需求合計") +
            card("hg-gap", "每日缺口") +
            card("hg-total", "住院期間總缺口") +
            "</div>") +
          subsection("實支實付雜費額度",
            '<div class="form-grid">' +
            field("rg-materials", "自費藥材／特材", 120000, "元", "健保不給付的塗藥心臟支架、人工水晶體、骨材等。") +
            field("rg-surgery", "自費手術相關", 80000, "元", "自費術式、達文西手術差額等。") +
            field("rg-room", "病房升等差額", 21000, "元", "病房差額 × 住院天數。") +
            field("rg-other", "其他自費", 0, "元", "自費藥品、檢查等。") +
            field("rg-limit", "保單雜費限額", 150000, "元", "實支實付保單「醫療雜費」那一項的每次住院上限。") +
            "</div>" +
            '<div class="results-grid">' +
            card("rg-total", "自費合計") +
            card("rg-gap", "額度缺口") +
            card("rg-rate", "可覆蓋比例") +
            "</div>") +
          glossary([
            ["遺屬需求法", "算保額的方法之一：把家人未來需要的錢全部加總，再扣掉已有的保障與可變現資產，差額就是應該補上的壽險保額。另一種常見方法是所得替代法（年收入 × 倍數）。"],
            ["住院日額", "住院一天給付固定金額的保險，不看實際花多少。用來補病房差額、看護費與收入損失。"],
            ["實支實付", "在額度內按實際收據金額理賠。通常拆成「病房費」「手術費」「醫療雜費」三個項目，各有各的上限。"],
            ["醫療雜費（雜費限額）", "實支實付裡最關鍵的一項，涵蓋健保不給付的藥材、特材、自費檢查等。現在的自費醫材動輒十幾萬，這一項的額度往往決定保單夠不夠用。"],
            ["病房差額", "健保房（多為三人房以上）與自己想住的雙人房、單人房之間的價差，需自費負擔。"],
            ["副本理賠", "用收據副本就能申請理賠，讓同一筆醫療費可以向多家公司請領。近年多家保單改為只收正本，投保前要確認。"]
          ])
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
          }).join("") +
          glossary([
            ["保險存摺", "壽險公會建置的平台，可查個人名下所有有效保單。核保上最常用來確認累積投保額度有沒有超過公司上限，以及有沒有道德風險的疑慮。要本人以自然人憑證或行動裝置認證登入。"],
            ["健康存摺", "健保署的個人就醫紀錄查詢。核對「告知事項」時最關鍵的工具 —— 要保書問的近兩年、五年內就醫紀錄，這裡都查得到。忘記填會構成違反告知義務，保險公司可在兩年內解約。"],
            ["保發中心", "財團法人保險事業發展中心。所有在台販售的保險商品條款、費率、商品說明都在這裡備查。業務給的文件如果和這裡的條款衝突，以條款為準。"],
            ["公開資訊觀測站", "金管會保險局的公開平台，可查各保險公司的財務狀況、資本適足率、申訴率與理賠統計。"],
            ["告知義務", "要保書上的健康告知事項必須據實填寫。故意隱匿或過失遺漏足以變更核保決定的事項，保險公司可在契約訂立後兩年內解除契約，且不退還保費。這是理賠糾紛最常見的原因。"]
          ])
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

  function filteredConditions() {
    var q = condState.q.trim().toLowerCase();
    return C.DATA.NEWBORN_CONDITIONS.filter(function (c) {
      if (condState.group !== "全部" && c.group !== condState.group) return false;
      if (!q) return true;
      return (c.name + c.detail + c.docs + c.group + c.tendency).toLowerCase().indexOf(q) > -1;
    });
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

    var rows = filteredConditions();
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
     匯出

     七種格式全部在瀏覽器端組出來，不引入任何外部套件，才符合本頁的 CSP，
     也才能離線使用。
       txt / md / json  —— 純文字組字串
       csv              —— 加 UTF-8 BOM，Excel 開啟不會亂碼
       xls / doc        —— HTML + 對應的 MIME，Excel 與 Word 都認得，
                           這是不引入函式庫產生 Office 檔最可靠的做法
       html             —— 自帶樣式的獨立報告，可再用瀏覽器存成 PDF
     --------------------------------------------------------------------------- */

  function status(msg) {
    var n = document.querySelector("#calculator [data-status]");
    if (!n) return;
    n.textContent = msg;
    setTimeout(function () { if (n.textContent === msg) n.textContent = ""; }, 3000);
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

  /** 把目前面板的輸入、結果、表格、名詞解釋收成結構化資料，各格式共用 */
  function collect() {
    var area = $("calculator");
    var tool = currentTool();

    var inputs = [];
    Array.prototype.forEach.call(area.querySelectorAll("input, select"), function (n) {
      if (n.type === "search" || n.dataset.doc || n.id === "export-format") return;
      var label = n.closest("label");
      var span = label ? label.querySelector("span") : null;
      var name = span ? span.textContent.trim() : n.id;
      if (n.type === "checkbox") { if (n.checked) inputs.push([name, "是"]); }
      else if (n.value !== "") {
        inputs.push([name, n.tagName === "SELECT" && n.selectedOptions[0] ? n.selectedOptions[0].textContent.trim() : n.value]);
      }
    });

    var results = [];
    Array.prototype.forEach.call(area.querySelectorAll(".result-card"), function (c) {
      var v = c.querySelector("strong").textContent.trim();
      if (v && v !== DASH) {
        var note = c.querySelector("small");
        results.push([c.querySelector("span").textContent.trim(), v, note ? note.textContent.trim() : ""]);
      }
    });

    var tables = [];
    Array.prototype.forEach.call(area.querySelectorAll(".table-wrap table"), function (tb) {
      var head = Array.prototype.map.call(tb.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
      var body = Array.prototype.map.call(tb.querySelectorAll("tbody tr"), function (tr) {
        return Array.prototype.map.call(tr.children, function (td) { return td.textContent.trim(); });
      });
      tables.push({ head: head, body: body });
    });

    var gloss = [];
    var dl = area.querySelector(".uw-gloss");
    if (dl) {
      var dts = dl.querySelectorAll("dt");
      var dds = dl.querySelectorAll("dd");
      for (var i = 0; i < dts.length; i++) {
        gloss.push([dts[i].textContent.trim(), dds[i] ? dds[i].textContent.trim() : ""]);
      }
    }

    var docs = null;
    if (tool.id === "newborn-condition") {
      var st = loadDocs();
      docs = C.DATA.NEWBORN_DOCS.map(function (d) {
        return [d.label, d.required ? "必備" : "視情況", st[d.key] ? "已備齊" : "尚未", d.note];
      });
    }

    return {
      tool: tool,
      title: tool.heading,
      generatedAt: new Date(),
      inputs: inputs,
      results: results,
      tables: tables,
      glossary: gloss,
      docs: docs
    };
  }

  var DISCLAIMER =
    "本文件為投保前的初步試算，不等於保險公司的核保決定，也不構成醫療、法律或財務建議。" +
    "實際年齡認定、等待期、期別係數與保額上限，以各商品條款、要保書及主管機關公告為準；" +
    "體況件請先向保險公司做事先徵詢（預核保）。";

  var SIGNATURE = "EliNotebook 核保工具中心｜葉秀庭（保險經紀人公司業務員）";

  function buildTxt(d) {
    var L = [];
    L.push("【" + d.title + "】");
    L.push("產生時間：" + d.generatedAt.toLocaleString("zh-TW"));
    L.push("");
    if (d.inputs.length) {
      L.push("── 輸入條件 ──");
      d.inputs.forEach(function (r) { L.push("  " + r[0] + "：" + r[1]); });
      L.push("");
    }
    if (d.results.length) {
      L.push("── 試算結果 ──");
      d.results.forEach(function (r) { L.push("  " + r[0] + "：" + r[1] + (r[2] ? "（" + r[2] + "）" : "")); });
      L.push("");
    }
    d.tables.forEach(function (t, i) {
      L.push("── 明細表 " + (i + 1) + " ──");
      L.push("  " + t.head.join("｜"));
      t.body.forEach(function (row) { L.push("  " + row.join("｜")); });
      L.push("");
    });
    if (d.docs) {
      L.push("── 應備文件檢核 ──");
      d.docs.forEach(function (r) { L.push("  [" + (r[2] === "已備齊" ? "V" : " ") + "] " + r[0] + "（" + r[1] + "）" + r[3]); });
      L.push("");
    }
    if (d.glossary.length) {
      L.push("── 名詞解釋 ──");
      d.glossary.forEach(function (g) { L.push("  " + g[0] + "：" + g[1]); });
      L.push("");
    }
    L.push("───────────────");
    L.push(SIGNATURE);
    L.push(DISCLAIMER);
    return L.join("\n");
  }

  function buildMarkdown(d) {
    var L = [];
    L.push("# " + d.title);
    L.push("");
    L.push("> 產生時間：" + d.generatedAt.toLocaleString("zh-TW") + "　·　" + SIGNATURE);
    L.push("");
    var kv = function (title, rows) {
      if (!rows.length) return;
      L.push("## " + title);
      L.push("");
      L.push("| 項目 | 內容 |");
      L.push("| --- | --- |");
      rows.forEach(function (r) { L.push("| " + r[0] + " | " + r[1] + " |"); });
      L.push("");
    };
    kv("輸入條件", d.inputs);
    kv("試算結果", d.results);
    d.tables.forEach(function (t, i) {
      L.push("## 明細表 " + (i + 1));
      L.push("");
      L.push("| " + t.head.join(" | ") + " |");
      L.push("| " + t.head.map(function () { return "---"; }).join(" | ") + " |");
      t.body.forEach(function (row) { L.push("| " + row.join(" | ") + " |"); });
      L.push("");
    });
    if (d.docs) {
      L.push("## 應備文件檢核");
      L.push("");
      d.docs.forEach(function (r) {
        L.push("- [" + (r[2] === "已備齊" ? "x" : " ") + "] **" + r[0] + "**（" + r[1] + "）— " + r[3]);
      });
      L.push("");
    }
    if (d.glossary.length) {
      L.push("## 名詞解釋");
      L.push("");
      d.glossary.forEach(function (g) { L.push("- **" + g[0] + "**：" + g[1]); });
      L.push("");
    }
    L.push("---");
    L.push("");
    L.push("_" + DISCLAIMER + "_");
    return L.join("\n");
  }

  function csvEscape(c) {
    return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
  }

  function buildCsvRows(d) {
    var rows = [["EliNotebook 核保工具中心"], [d.title], ["產生時間", d.generatedAt.toLocaleString("zh-TW")], []];
    if (d.inputs.length) { rows.push(["輸入條件", ""]); d.inputs.forEach(function (r) { rows.push([r[0], r[1]]); }); rows.push([]); }
    if (d.results.length) { rows.push(["試算結果", "", "說明"]); d.results.forEach(function (r) { rows.push(r); }); rows.push([]); }
    d.tables.forEach(function (t, i) {
      rows.push(["明細表 " + (i + 1)]);
      rows.push(t.head);
      t.body.forEach(function (r) { rows.push(r); });
      rows.push([]);
    });
    if (d.docs) {
      rows.push(["應備文件檢核"]);
      rows.push(["文件", "必要性", "狀態", "說明"]);
      d.docs.forEach(function (r) { rows.push(r); });
      rows.push([]);
      rows.push(["21 項公費新生兒篩檢"]);
      C.DATA.NEWBORN_SCREENING.forEach(function (s, i) { rows.push([i + 1, s]); });
      rows.push([]);
      rows.push(["常見自費篩檢項目"]);
      C.DATA.NEWBORN_SCREENING_SELF_PAID.forEach(function (s, i) { rows.push([i + 1, s]); });
      rows.push([]);
    }
    if (d.glossary.length) {
      rows.push(["名詞解釋"]);
      rows.push(["名詞", "說明"]);
      d.glossary.forEach(function (g) { rows.push(g); });
      rows.push([]);
    }
    rows.push([DISCLAIMER]);
    return rows;
  }

  function buildCsv(d) {
    return buildCsvRows(d).map(function (r) { return r.map(csvEscape).join(","); }).join("\r\n");
  }

  /** Excel 認得的 HTML 表格。比 CSV 好的地方是能保留分區標題與粗體。 */
  function buildXls(d) {
    var rows = buildCsvRows(d);
    var body = rows.map(function (r) {
      if (!r.length) return "<tr><td></td></tr>";
      var isHeader = r.length === 1 || (r.length > 1 && r[1] === "");
      return "<tr>" + r.map(function (c) {
        return isHeader ? '<td class="h">' + esc(c) + "</td>" : "<td>" + esc(c) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head>' +
      '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
      "<style>td{mso-number-format:'\\@';vertical-align:top}td.h{font-weight:bold;background:#DED9D1}</style>" +
      "</head><body><table border=\"1\">" + body + "</table></body></html>";
  }

  /** Word 認得的 HTML 文件。用於直接貼進建議書或客戶說明。 */
  function buildDoc(d) {
    var h = [];
    h.push('<html xmlns:w="urn:schemas-microsoft-com:office:word"><head>');
    h.push('<meta http-equiv="Content-Type" content="text/html; charset=utf-8">');
    h.push("<title>" + esc(d.title) + "</title><style>");
    h.push('body{font-family:"Microsoft JhengHei","PMingLiU",serif;font-size:11pt;line-height:1.7;color:#2b2f31}');
    h.push("h1{font-size:16pt;border-bottom:2px solid #444e45;padding-bottom:6pt}");
    h.push("h2{font-size:12.5pt;color:#444e45;margin-top:16pt}");
    h.push("table{border-collapse:collapse;width:100%;font-size:10pt;margin-top:6pt}");
    h.push("th,td{border:1px solid #c3bdb2;padding:5pt 7pt;text-align:left;vertical-align:top}");
    h.push("th{background:#ded9d1}");
    h.push(".meta{color:#4f4b46;font-size:9.5pt}");
    h.push(".note{background:#f0e6d5;border-left:3pt solid #776746;padding:8pt 10pt;font-size:9.5pt;margin-top:16pt}");
    h.push("dt{font-weight:bold;margin-top:6pt}dd{margin:0 0 4pt 0;color:#4f4b46;font-size:10pt}");
    h.push("</style></head><body>");
    h.push("<h1>核保試算報告</h1>");
    h.push('<p class="meta">' + esc(d.title) + "　·　" + esc(d.generatedAt.toLocaleString("zh-TW")) + "　·　" + esc(SIGNATURE) + "</p>");

    var kvTable = function (title, rows, cols) {
      if (!rows.length) return;
      h.push("<h2>" + esc(title) + "</h2><table>");
      if (cols) h.push("<tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>");
      rows.forEach(function (r) {
        h.push("<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>");
      });
      h.push("</table>");
    };
    kvTable("輸入條件", d.inputs, ["項目", "內容"]);
    kvTable("試算結果", d.results.map(function (r) { return [r[0], r[1], r[2]]; }), ["項目", "結果", "說明"]);
    d.tables.forEach(function (t, i) { kvTable("明細表 " + (i + 1), t.body, t.head); });
    if (d.docs) kvTable("應備文件檢核", d.docs, ["文件", "必要性", "狀態", "說明"]);
    if (d.glossary.length) {
      h.push("<h2>名詞解釋</h2><dl>");
      d.glossary.forEach(function (g) { h.push("<dt>" + esc(g[0]) + "</dt><dd>" + esc(g[1]) + "</dd>"); });
      h.push("</dl>");
    }
    h.push('<p class="note"><b>聲明</b>：' + esc(DISCLAIMER) + "</p>");
    h.push("</body></html>");
    return h.join("");
  }

  function buildJson(d) {
    return JSON.stringify({
      source: "EliNotebook 核保工具中心",
      version: C.VERSION,
      tool: { id: d.tool.id, title: d.tool.title, heading: d.tool.heading },
      generatedAt: d.generatedAt.toISOString(),
      inputs: d.inputs.map(function (r) { return { label: r[0], value: r[1] }; }),
      results: d.results.map(function (r) { return { label: r[0], value: r[1], note: r[2] }; }),
      tables: d.tables,
      glossary: d.glossary.map(function (g) { return { term: g[0], definition: g[1] }; }),
      documents: d.docs ? d.docs.map(function (r) { return { name: r[0], required: r[1] === "必備", ready: r[2] === "已備齊", note: r[3] }; }) : null,
      disclaimer: DISCLAIMER
    }, null, 2);
  }

  /** 自帶樣式的獨立 HTML 報告，可離線開啟或再存成 PDF */
  function buildHtml(d) {
    var sec = function (title, inner) { return "<section><h2>" + esc(title) + "</h2>" + inner + "</section>"; };
    var kv = function (rows, cols) {
      return '<table class="kv">' +
        (cols ? "<thead><tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead>" : "") +
        "<tbody>" + rows.map(function (r) {
          return "<tr>" + r.map(function (c, i) {
            return i === 0 ? "<th>" + esc(c) + "</th>" : "<td>" + esc(c) + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table>";
    };

    var out = [];
    out.push('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">');
    out.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
    out.push("<title>核保試算報告－" + esc(d.tool.title) + "</title><style>");
    out.push(":root{--ink:#2b2f31;--muted:#4f4b46;--line:#c3bdb2;--paper:#e9e5de;--surface:#f3f0ea;--alt:#ded9d1;--green:#444e45}");
    out.push("*{box-sizing:border-box}body{margin:0;padding:2rem 1.25rem 4rem;background:var(--paper);color:var(--ink);");
    out.push('font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;line-height:1.65}');
    out.push(".wrap{max-width:900px;margin:0 auto}");
    out.push("header{border-bottom:2px solid var(--green);padding-bottom:.8rem;margin-bottom:1.6rem}");
    out.push("h1{margin:0 0 .2rem;font-size:1.35rem}header p{margin:0;color:var(--muted);font-size:.82rem}");
    out.push("section{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--green);");
    out.push("border-radius:10px;padding:1rem 1.1rem;margin-bottom:1rem;page-break-inside:avoid}");
    out.push("h2{margin:0 0 .7rem;font-size:1rem}");
    out.push("table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.6rem}");
    out.push("th,td{padding:.4rem .6rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}");
    out.push("thead th{background:var(--alt)}table.kv tbody th{width:38%;font-weight:500;color:var(--muted)}");
    out.push("dl{margin:0}dt{font-weight:700;margin-top:.6rem;font-size:.88rem}dd{margin:.1rem 0 0;color:var(--muted);font-size:.82rem;line-height:1.7}");
    out.push("footer{margin-top:2rem;padding:.9rem 1rem;border-radius:9px;background:#f0e6d5;border-left:3px solid #776746;font-size:.78rem}");
    out.push("@media print{body{background:#fff;padding:0}section{box-shadow:none}}");
    out.push('</style></head><body><div class="wrap"><header><h1>核保試算報告</h1>');
    out.push("<p>" + esc(d.title) + "　·　" + esc(d.generatedAt.toLocaleString("zh-TW")) + "　·　" + esc(SIGNATURE) + "</p></header>");

    if (d.inputs.length) out.push(sec("輸入條件", kv(d.inputs)));
    if (d.results.length) out.push(sec("試算結果", kv(d.results.map(function (r) { return [r[0], r[1], r[2]]; }))));
    d.tables.forEach(function (t, i) {
      out.push(sec("明細表 " + (i + 1),
        "<table><thead><tr>" + t.head.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        t.body.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
        "</tbody></table>"));
    });
    if (d.docs) out.push(sec("應備文件檢核", kv(d.docs, ["文件", "必要性", "狀態", "說明"])));
    if (d.glossary.length) {
      out.push(sec("名詞解釋", "<dl>" + d.glossary.map(function (g) {
        return "<dt>" + esc(g[0]) + "</dt><dd>" + esc(g[1]) + "</dd>";
      }).join("") + "</dl>"));
    }
    out.push("<footer><strong>聲明</strong>：" + esc(DISCLAIMER) + "</footer></div></body></html>");
    return out.join("");
  }

  var BUILDERS = {
    txt: { build: buildTxt, ext: "txt", mime: "text/plain", bom: false, label: "純文字" },
    md: { build: buildMarkdown, ext: "md", mime: "text/markdown", bom: false, label: "Markdown" },
    csv: { build: buildCsv, ext: "csv", mime: "text/csv", bom: true, label: "CSV" },
    xls: { build: buildXls, ext: "xls", mime: "application/vnd.ms-excel", bom: true, label: "Excel" },
    doc: { build: buildDoc, ext: "doc", mime: "application/msword", bom: true, label: "Word" },
    html: { build: buildHtml, ext: "html", mime: "text/html", bom: false, label: "網頁報告" },
    json: { build: buildJson, ext: "json", mime: "application/json", bom: false, label: "JSON" }
  };

  function doDownload() {
    var fmt = val("export-format") || "txt";
    var b = BUILDERS[fmt];
    if (!b) return;
    var d = collect();
    if (!d.inputs.length && !d.results.length && !d.tables.length && !d.docs) {
      status("目前沒有內容可以匯出，先填幾個欄位");
      return;
    }
    var name = "核保試算-" + currentTool().title + "-" + stamp() + "." + b.ext;
    download(name, b.build(d), b.mime, b.bom);
    status("已下載 " + b.label + "：" + name);
  }

  function copyText() {
    var text = buildTxt(collect());
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

  var FMT_KEY = "eli-uw-format";

  function bind() {
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

    $("tool-search").addEventListener("input", function (e) {
      searchTerm = e.target.value;
      var list = visibleTools();
      if (list.length && !list.some(function (t) { return t.id === active; })) selectTool(list[0].id, false);
      else renderNav();
    });

    var area = $("calculator");

    area.addEventListener("input", function (e) {
      if (e.target.id === "cond-q") { condState.q = e.target.value; renderConditions(); return; }
      if (e.target.id === "export-format") return;
      recalc(e.target);
    });

    area.addEventListener("change", function (e) {
      if (e.target.id === "export-format") {
        try { localStorage.setItem(FMT_KEY, e.target.value); } catch (err) { /* 忽略 */ }
        return;
      }
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
      else if (a === "download") doDownload();
      else if (a === "print") window.print();
    });
  }

  /** 記住上次選的匯出格式，切換工作區後不用重選 */
  function restoreFormat() {
    var sel = $("export-format");
    if (!sel) return;
    try {
      var saved = localStorage.getItem(FMT_KEY);
      if (saved && BUILDERS[saved]) sel.value = saved;
    } catch (e) { /* 忽略 */ }
  }

  /* ---------------------------------------------------------------------------
     啟動
     --------------------------------------------------------------------------- */

  function init() {
    if (!$("tool-nav") || !$("calculator")) return;
    var hash = (location.hash || "").slice(1);
    if (hash && TOOLS.some(function (t) { return t.id === hash; })) active = hash;
    bind();

    // 每次換面板都要把格式選單還原成使用者上次選的
    var origSelect = selectTool;
    selectTool = function (id, focus) { origSelect(id, focus); restoreFormat(); };

    selectTool(active, false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
