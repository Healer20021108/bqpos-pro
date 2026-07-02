// KK 清帳核心：把 POS 金額整理成單欄清帳表。純函式、無 DOM／儲存副作用。

import { PAYMENT_GROUPS } from '../reconcile/data';
import { syncDeptToCompany } from '../reconcile/calculate';

export type KkRowKind =
  | 'total'
  | 'cash'
  | 'credit'
  | 'lineIpAss'
  | 'easycard'
  | 'other'
  | 'voucher'
  | 'panda'
  | 'uber';

export interface KkSettlementRow {
  kind: KkRowKind;
  label: string;
  amount: number;
}

export interface KkSettlement {
  rows: KkSettlementRow[];
  total: number;
  other: number;
}

const COMPANY_KEYS = PAYMENT_GROUPS.company.map((field) => field.key);

function amountOf(amounts: Record<string, number>, key: string): number {
  const value = amounts[key];
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function buildKkSettlement(amounts: Record<string, number>): KkSettlement {
  const value = (key: string): number => amountOf(amounts, key);
  const total = COMPANY_KEYS.reduce((sum, key) => sum + value(key), 0);
  const cash = value('cash');
  const credit = value('credit');
  const lineIpAss = value('linepay') + value('ipass_card');
  const easycard = value('easycard_card');
  const voucher = value('voucher') + value('product_voucher');
  const panda = value('foodpanda');
  const uber = value('ubereats');

  // 使用者指定：街口／悠遊付等＝營業總額扣除所有獨立列出的款別。
  const other = total - cash - credit - lineIpAss - easycard - voucher - panda - uber;

  const rows: KkSettlementRow[] = [
    { kind: 'total', label: '總營業額', amount: total },
    { kind: 'cash', label: '現金', amount: cash },
    { kind: 'credit', label: '信用卡', amount: credit },
    { kind: 'lineIpAss', label: 'LINE Pay＋iPASS MONEY', amount: lineIpAss },
    { kind: 'easycard', label: '悠遊卡', amount: easycard },
    { kind: 'other', label: '街口／悠遊付等', amount: other },
    { kind: 'voucher', label: '百貨禮券', amount: voucher },
    { kind: 'panda', label: 'Panda', amount: panda },
    { kind: 'uber', label: 'Uber', amount: uber },
  ];

  return { rows, total, other };
}

/**
 * 直接將百貨 POS 金額依對帳規則轉成 KK 清帳。
 * 不依賴使用者先按「同步百貨POS金額」寫入公司 POS。
 */
export function buildKkSettlementFromDept(dept: Record<string, number>): KkSettlement {
  return buildKkSettlement(syncDeptToCompany(dept));
}
