// Excel 匯出：以固定範本為底，只填 H 欄與 J2 日期，其餘（格式、合併、J=H*G 公式）原樣保留。
// exceljs 較大，改用動態 import，只有按下匯出時才載入，不拖累初次開啟速度。

import templateUrl from './template.xlsx?url';
import type { ExcelCellValue } from './calculate';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function isFormula(value: ExcelCellValue): value is { formula: string } {
  return typeof value === 'object' && value !== null && 'formula' in value;
}

/**
 * 用範本產生填好的盤點 Excel 檔。
 * @param cells 儲存格位址 → 值（數字、字串或 {formula}）。
 * @param fileName 輸出檔名。
 */
export async function exportInventoryExcel(
  cells: Readonly<Record<string, ExcelCellValue>>,
  fileName: string,
): Promise<File> {
  const { Workbook } = await import('exceljs');

  const templateBytes = await fetch(templateUrl).then((res) => {
    if (!res.ok) throw new Error(`載入盤點範本失敗（${res.status}）`);
    return res.arrayBuffer();
  });

  const workbook = new Workbook();
  await workbook.xlsx.load(templateBytes);
  // 讓 Excel 開檔時重算 J=H*G，J 欄才會顯示最新入庫量。
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.worksheets[0];
  for (const [address, value] of Object.entries(cells)) {
    sheet.getCell(address).value = isFormula(value) ? { formula: value.formula } : value;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer as BlobPart], fileName, { type: XLSX_MIME });
}

/** 匯出檔名，例如 2026KK板橋門市7月份盤點表.xlsx。 */
export function inventoryFileName(date = new Date()): string {
  return `${date.getFullYear()}KK板橋門市${date.getMonth() + 1}月份盤點表.xlsx`;
}
