// 環球清帳核心：把百貨POS金額快照（dept）依對應規則攤成結帳單各列。純函式、可測試。
// 規則：對應到的欄位加總帶入；沒對應到、且不在略過清單、金額>0 的百貨POS欄位，
// 依畫面順序自動補在右欄「外帶自取」下方；最後算「實收總計」。

import { FORM_LEFT, FORM_RIGHT, SKIP_KEYS, DEPT_ORDER, DEPT_LABELS, type FormItem } from './data';

export interface SettlementRow {
  label: string;
  amount: number;
  /** true＝自動補列（百貨POS有金額但表單無對應），UI 會標示「補」。 */
  appended: boolean;
}

export interface Settlement {
  /** 左欄 實收款別 */
  left: SettlementRow[];
  /** 右欄 實收有價證券（不含自動補列） */
  right: SettlementRow[];
  /** 自動補列（接在右欄外帶自取下方） */
  appended: SettlementRow[];
  /** 實收總計＝左＋右＋補列 */
  total: number;
}

function sumKeys(keys: string[], dept: Record<string, number>): number {
  return keys.reduce((s, k) => {
    const v = dept[k];
    return s + (typeof v === 'number' && v > 0 ? v : 0);
  }, 0);
}

export function buildSettlement(dept: Record<string, number>): Settlement {
  const mapItem = (it: FormItem): SettlementRow => ({
    label: it.label,
    amount: sumKeys(it.keys, dept),
    appended: false,
  });

  const left = FORM_LEFT.map(mapItem);
  const right = FORM_RIGHT.map(mapItem);

  // 已被表單對應「吃掉」的百貨POS keys，不再重複補列。
  const consumed = new Set<string>();
  for (const it of [...FORM_LEFT, ...FORM_RIGHT]) for (const k of it.keys) consumed.add(k);

  // 自動補列：依百貨POS畫面順序，挑出有金額、未被對應、且非略過者。
  const appended: SettlementRow[] = [];
  for (const key of DEPT_ORDER) {
    const v = dept[key];
    if (typeof v === 'number' && v > 0 && !consumed.has(key) && !SKIP_KEYS.has(key)) {
      appended.push({ label: DEPT_LABELS[key] ?? key, amount: v, appended: true });
    }
  }

  const total = [...left, ...right, ...appended].reduce((s, r) => s + r.amount, 0);
  return { left, right, appended, total };
}
