// 盤點計算：全部為純函式，方便用 vitest 驗證。
// 流程：各輸入格 → 折算成「最小單位」→ 加總 = 入庫最小單位(J) → ÷G = 盤點單位(H)。

import { INVENTORY_ITEMS, fieldKey, type InventoryField, type InventoryItem } from './items';

export type RawValue = string | number | null | undefined;
export type RawInputs = Readonly<Record<string, RawValue>>;

/** 寫進 Excel 儲存格的值：數字、字串，或公式（保留範本 J=H*G 由 Excel 重算）。 */
export type ExcelCellValue = number | string | { formula: string };

export interface FieldResult {
  field: InventoryField;
  /** 使用者是否在此格填了東西（用來決定要不要寫入 Excel）。 */
  hasEntry: boolean;
  /** 正規化後的數值（count 為整數，grams 允許小數）。 */
  value: number;
  /** 換算成最小單位後的貢獻量。 */
  contribution: number;
}

export interface ItemResult {
  item: InventoryItem;
  fields: FieldResult[];
  /** 此品項是否有任何輸入。 */
  hasInput: boolean;
  /** 入庫最小單位總量（對應 J 欄）。 */
  smallestTotal: number;
  /** 盤點單位數量（對應 H 欄）＝ smallestTotal ÷ G。 */
  displayQty: number;
  /** 有 grams 欄位皮重待測且已填克數：數字尚未定案，需提醒。 */
  pendingTare: boolean;
  /** 要寫入 H 欄的值；無輸入時為 null（維持空白）。 */
  excelH: ExcelCellValue | null;
}

export interface InventoryResult {
  items: ItemResult[];
}

/** 空白／null 一律非輸入。 */
function isEmpty(value: RawValue): boolean {
  return value === '' || value === null || value === undefined;
}

/** count 欄位：非負整數，否則 0（空白、負數、小數、非數字皆視為 0）。 */
export function normalizeCount(value: RawValue): number {
  if (isEmpty(value)) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return 0;
  return n;
}

/** grams 欄位：非負數，允許小數（磅秤可能顯示小數），否則 0。 */
export function normalizeGrams(value: RawValue): number {
  if (isEmpty(value)) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeField(field: InventoryField, value: RawValue): number {
  return field.kind === 'grams' ? normalizeGrams(value) : normalizeCount(value);
}

/** 依「最小單位總量」與 G 決定 H 欄要寫的值：整數盡量寫數字，餘數寫成除法公式以保 J 精確。 */
function toExcelH(smallestTotal: number, g: number): ExcelCellValue {
  if (g === 1) return smallestTotal;
  if (Number.isInteger(smallestTotal) && smallestTotal % g === 0) return smallestTotal / g;
  return { formula: `${smallestTotal}/${g}` };
}

function computeItem(item: InventoryItem, raw: RawInputs): ItemResult {
  let smallestTotal = 0;
  let hasInput = false;
  let pendingTare = false;

  const fields: FieldResult[] = item.fields.map((field) => {
    const rawValue = raw[fieldKey(item, field)];
    const hasEntry = !isEmpty(rawValue);
    const value = normalizeField(field, rawValue);

    let contribution: number;
    if (field.kind === 'grams') {
      const tare = field.tare ?? 0; // 皮重待測時暫不扣重
      contribution = Math.max(0, value - tare);
      if (field.tare === null && value > 0) pendingTare = true;
    } else {
      contribution = value * field.factor;
    }

    if (hasEntry) hasInput = true;
    smallestTotal += contribution;
    return { field, hasEntry, value, contribution };
  });

  return {
    item,
    fields,
    hasInput,
    smallestTotal,
    displayQty: smallestTotal / item.g,
    pendingTare,
    excelH: hasInput ? toExcelH(smallestTotal, item.g) : null,
  };
}

export function computeInventory(raw: RawInputs): InventoryResult {
  return { items: INVENTORY_ITEMS.map((item) => computeItem(item, raw)) };
}

/** 匯出時 J2 的日期字串，民國格式，例如 2026-07-02 → "日期:115.07.02"。 */
export const EXCEL_DATE_CELL = 'J2';

export function rocDateLabel(date = new Date()): string {
  const roc = date.getFullYear() - 1911;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `日期:${roc}.${mm}.${dd}`;
}

/** 把計算結果攤平成 Excel 儲存格對應（H 欄各品項 + J2 當天日期）。 */
export function toExcelCells(
  result: InventoryResult,
  date = new Date(),
): Record<string, ExcelCellValue> {
  const cells: Record<string, ExcelCellValue> = { [EXCEL_DATE_CELL]: rocDateLabel(date) };
  for (const row of result.items) {
    if (row.excelH !== null) cells[`H${row.item.excelRow}`] = row.excelH;
  }
  return cells;
}
