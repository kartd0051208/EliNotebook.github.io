"use strict";

// EliNotebook 3.7.1 單筆匯出模組。
// 特性：Word、PDF、Excel、TXT、Markdown、CSV 都在目前瀏覽器產生，不呼叫外部轉檔服務。
// 效果：使用者只匯出自己點選的一則備忘錄或一筆財務紀錄；其他本機資料不會被讀出或連帶下載。
(function exposeSingleExport(global) {
  const dialog = document.querySelector("#single-export-dialog");
  const titleElement = document.querySelector("#single-export-title");
  const descriptionElement = document.querySelector("#single-export-description");
  const warningElement = document.querySelector("#single-export-warning");
  const statusElement = document.querySelector("#single-export-status");
  const closeButton = document.querySelector("#single-export-close");
  const formatButtons = [...document.querySelectorAll("[data-single-export-format]")];
  let current = null;
  let previousFocus = null;
  let spreadsheetLibraryPromise = null;

  function text(value, maximum = 10000) { return String(value ?? "").replace(/\u0000/g, "").slice(0, maximum); }

  function localDateKey() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  }

  function filename(value) {
    const cleaned = text(value, 80).trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\.+$/g, "");
    return cleaned || "EliNotebook-single-item";
  }

  function normalizePayload(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.fields)) throw new TypeError("匯出資料格式不正確");
    const fields = value.fields.slice(0, 100).map((field) => ({
      label: text(field?.label, 100).trim() || "欄位",
      value: text(field?.value),
      spreadsheetValue: typeof field?.spreadsheetValue === "number" && Number.isFinite(field.spreadsheetValue) ? field.spreadsheetValue : text(field?.value)
    }));
    if (!fields.length) throw new TypeError("沒有可匯出的欄位");
    return {
      kind: value.kind === "finance" ? "finance" : "note",
      title: text(value.title, 120).trim() || "EliNotebook 單筆資料",
      filenameBase: filename(value.filenameBase),
      fields
    };
  }

  function spreadsheetSafe(value) {
    const result = text(value);
    return /^[=+\-@]/.test(result.trimStart()) ? `'${result}` : result;
  }

  function csvCell(value) { return `"${spreadsheetSafe(value).replace(/"/g, '""')}"`; }

  function download(name, content, mimeType) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function escapeHtml(value) {
    return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function exportTxt(payload) {
    const body = [payload.title, "", ...payload.fields.flatMap((field) => [`${field.label}：`, field.value, ""])].join("\n").trimEnd();
    download(`${payload.filenameBase}-${localDateKey()}.txt`, `\uFEFF${body}\n`, "text/plain;charset=utf-8");
  }

  function markdownValue(value) { return text(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "  \n"); }

  function exportMarkdown(payload) {
    const body = [`# ${markdownValue(payload.title)}`, "", ...payload.fields.flatMap((field) => [`## ${markdownValue(field.label)}`, "", markdownValue(field.value) || "（空白）", ""])].join("\n").trimEnd();
    download(`${payload.filenameBase}-${localDateKey()}.md`, `\uFEFF${body}\n`, "text/markdown;charset=utf-8");
  }

  function exportCsv(payload) {
    const rows = [["欄位", "內容"], ...payload.fields.map((field) => [field.label, field.value])];
    download(`${payload.filenameBase}-${localDateKey()}.csv`, `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
  }

  // Word採用可離線開啟的HTML型.doc相容檔，避免把資料送到線上Word轉檔服務。
  function exportWord(payload) {
    const rows = payload.fields.map((field) => `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(field.value).replace(/\r?\n/g, "<br>") || "（空白）"}</td></tr>`).join("");
    const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title><style>body{font-family:Arial,'Microsoft JhengHei',sans-serif;color:#202622;line-height:1.65;margin:42px}h1{font-family:Georgia,'Microsoft JhengHei',serif;font-weight:500;border-bottom:1px solid #c9ceca;padding-bottom:12px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;border:1px solid #c9ceca;text-align:left;vertical-align:top;white-space:pre-wrap}th{width:23%;background:#f3f4f2}</style></head><body><h1>${escapeHtml(payload.title)}</h1><table><tbody>${rows}</tbody></table></body></html>`;
    download(`${payload.filenameBase}-${localDateKey()}.doc`, `\uFEFF${documentHtml}`, "application/msword;charset=utf-8");
  }

  function loadSpreadsheetLibrary() {
    if (global.XLSX?.version === "0.20.3") return Promise.resolve(global.XLSX);
    if (spreadsheetLibraryPromise) return spreadsheetLibraryPromise;
    spreadsheetLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => reject(new Error("試算表元件載入逾時")), 20000);
      script.src = new URL("./vendor/sheetjs/xlsx.full.min.js", window.location.href).href;
      script.addEventListener("load", () => { window.clearTimeout(timer); if (global.XLSX?.version === "0.20.3") resolve(global.XLSX); else reject(new Error("試算表元件版本不正確")); }, { once: true });
      script.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("試算表元件載入失敗")); }, { once: true });
      document.head.append(script);
    }).catch((error) => { spreadsheetLibraryPromise = null; throw error; });
    return spreadsheetLibraryPromise;
  }

  async function exportExcel(payload) {
    const XLSX = await loadSpreadsheetLibrary();
    const rows = [["欄位", "內容"], ...payload.fields.map((field) => [spreadsheetSafe(field.label), typeof field.spreadsheetValue === "number" ? field.spreadsheetValue : spreadsheetSafe(field.spreadsheetValue)])];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 22 }, { wch: 58 }];
    XLSX.utils.book_append_sheet(workbook, sheet, payload.kind === "finance" ? "單筆財務" : "單筆備忘錄");
    XLSX.writeFile(workbook, `${payload.filenameBase}-${localDateKey()}.xlsx`, { bookType: "xlsx", compression: true });
  }

  // PDF採系統列印流程，讓繁體中文字型由使用者裝置負責渲染；選「儲存為PDF」即可得到檔案。
  function exportPdf(payload) {
    const frame = document.createElement("iframe");
    frame.className = "single-export-print-frame";
    frame.title = "單筆資料PDF列印預覽";
    document.body.append(frame);
    const printDocument = frame.contentDocument;
    if (!printDocument) { frame.remove(); throw new Error("瀏覽器無法建立列印頁面"); }
    const meta = printDocument.createElement("meta"); meta.charset = "utf-8";
    const pageTitle = printDocument.createElement("title"); pageTitle.textContent = payload.title;
    const stylesheet = printDocument.createElement("link"); stylesheet.rel = "stylesheet"; stylesheet.href = new URL("./style/single-export-print.css", window.location.href).href;
    printDocument.head.replaceChildren(meta, pageTitle, stylesheet);
    const main = printDocument.createElement("main");
    const kicker = printDocument.createElement("p"); kicker.className = "export-kicker"; kicker.textContent = "ELINOTEBOOK SINGLE ITEM EXPORT";
    const heading = printDocument.createElement("h1"); heading.textContent = payload.title;
    const list = printDocument.createElement("dl");
    payload.fields.forEach((field) => { const term = printDocument.createElement("dt"); term.textContent = field.label; const detail = printDocument.createElement("dd"); detail.textContent = field.value || "（空白）"; list.append(term, detail); });
    const footer = printDocument.createElement("footer"); footer.textContent = `由EliNotebook於 ${new Date().toLocaleString("zh-TW")} 在本機產生；請妥善保存匯出檔案。`;
    main.append(kicker, heading, list, footer); printDocument.body.replaceChildren(main);
    const cleanup = () => frame.remove();
    frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => { frame.contentWindow?.print(); }, 250);
    window.setTimeout(cleanup, 60000);
  }

  function setBusy(busy) { formatButtons.forEach((button) => { button.disabled = busy; }); }

  async function handleFormat(format) {
    if (!current) return;
    if (current.kind === "finance" && !window.confirm("這份單筆財務檔案不會加密。確定要下載或列印嗎？")) return;
    setBusy(true); statusElement.textContent = format === "pdf" ? "正在開啟列印視窗；請選擇「儲存為 PDF」。" : "正在建立檔案……";
    try {
      if (format === "doc") exportWord(current);
      else if (format === "pdf") exportPdf(current);
      else if (format === "xlsx") await exportExcel(current);
      else if (format === "txt") exportTxt(current);
      else if (format === "md") exportMarkdown(current);
      else if (format === "csv") exportCsv(current);
      else throw new Error("不支援的匯出格式");
      statusElement.textContent = format === "pdf" ? "列印視窗已開啟；選擇「儲存為 PDF」即可。" : "檔案已建立並開始下載。";
    } catch (error) {
      console.error("單筆匯出失敗：", error);
      statusElement.textContent = `無法匯出：${error instanceof Error ? error.message : "未知錯誤"}。`;
    } finally { setBusy(false); }
  }

  function open(value) {
    if (!dialog) throw new Error("找不到單筆匯出視窗");
    current = normalizePayload(value);
    previousFocus = document.activeElement;
    titleElement.textContent = current.title;
    descriptionElement.textContent = `只匯出目前點選的${current.kind === "finance" ? "財務紀錄" : "備忘錄"}；選擇格式後會在這台裝置產生檔案，不會上傳內容。`;
    warningElement.textContent = `${current.kind === "finance" ? "財務資料" : "備忘錄"}匯出檔不會加密，下載後請自行妥善保存。`;
    statusElement.textContent = "";
    dialog.hidden = false;
    closeButton.focus();
  }

  function close() {
    if (!dialog) return;
    dialog.hidden = true; current = null; statusElement.textContent = "";
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }

  closeButton?.addEventListener("click", close);
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  formatButtons.forEach((button) => button.addEventListener("click", () => handleFormat(button.dataset.singleExportFormat)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && dialog && !dialog.hidden) close(); });

  global.EliSingleExport = Object.freeze({ open, close });
})(window);
