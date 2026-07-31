"use strict";

// 私人財務中心的試算表解析工作執行緒。
// 特性：解析工作和主畫面隔離；不接觸DOM、localStorage或解密金鑰，也不執行儲存格公式。
// 支援：SheetJS 0.20.3可讀取的Excel（.xlsx／.xls）與Apple Numbers（.numbers）。
// 安全限制：只讀第一個工作表、最多10,021列與40欄，且不讀取巨集、HTML、樣式或內部檔案。
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_WORKSHEET_ROWS = 10021;
const MAX_WORKSHEET_COLUMNS = 40;

try {
  importScripts("../vendor/sheetjs/xlsx.full.min.js");
} catch (_error) {
  self.postMessage({ ok: false, message: "試算表解析元件無法載入。" });
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function safeCellValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { __eliDate: localDateKey(value) };
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return "";
  return String(value).slice(0, 2000);
}

self.addEventListener("message", (event) => {
  try {
    if (event.data?.action !== "parse-spreadsheet" || !(event.data.buffer instanceof ArrayBuffer)) throw new Error("無效的解析要求");
    if (event.data.buffer.byteLength > MAX_FILE_BYTES) throw new Error("檔案超過5MB上限");
    if (!self.XLSX || self.XLSX.version !== "0.20.3") throw new Error("試算表解析元件版本不正確");

    const workbook = self.XLSX.read(event.data.buffer, {
      type: "array",
      dense: true,
      raw: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: false,
      cellDates: true,
      sheetStubs: false,
      sheetRows: MAX_WORKSHEET_ROWS + 1,
      bookDeps: false,
      bookFiles: false,
      bookVBA: false,
      WTF: true,
      sheets: 0
    });
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets?.[sheetName] : null;
    if (!sheet) throw new Error("找不到第一個工作表");

    const sourceRows = self.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "", blankrows: false });
    const truncated = sourceRows.length > MAX_WORKSHEET_ROWS;
    const columnOverflow = sourceRows.some((row) => Array.isArray(row) && row.length > MAX_WORKSHEET_COLUMNS);
    const rows = sourceRows.slice(0, MAX_WORKSHEET_ROWS).map((row) => (Array.isArray(row) ? row.slice(0, MAX_WORKSHEET_COLUMNS).map(safeCellValue) : []));
    self.postMessage({ ok: true, sheetName: String(sheetName).slice(0, 100), sheetCount: workbook.SheetNames.length, rows, truncated, columnOverflow });
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message.slice(0, 200) : "無法解析試算表。" });
  }
});
