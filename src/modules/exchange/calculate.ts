// 換錢計算核心（純函式，無 DOM、無副作用，可單獨測試）。
//
// 簡化版邏輯：每個幣值各自比對單一目標持有量。
//   要換的數量 = max(0, 目標 − 目前)
//   多出的數量 = max(0, 目前 − 目標)

import type { Denomination } from '../../core/types';
import { denominations, unitLabel, stockTargets } from '../../core/rules';

/**
 * 將輸入值正規化為合法數量。
 * 規格：空白視為 0，且不允許負數與小數。
 * 因此空白／非數字／負數／小數一律視為無效，回傳 0。
 */
export function sanitizeCount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

export interface DenominationResult {
  denom: Denomination;
  unit: '張' | '個';
  current: number;
  target: number;
  /** 要換的數量（目前低於目標才有）。 */
  exchangeCount: number;
  /** 多出的數量（目前高於目標）。 */
  extra: number;
  /** 該幣值要換的金額。 */
  amount: number;
}

export interface CalculationResult {
  lines: DenominationResult[];
  /** 全部要換的金額合計。 */
  totalAmount: number;
  needsExchange: boolean;
}

export function calcDenomination(denom: Denomination, current: number): DenominationResult {
  const target = stockTargets[denom];
  const exchangeCount = Math.max(0, target - current);
  const extra = Math.max(0, current - target);
  return {
    denom,
    unit: unitLabel(denom),
    current,
    target,
    exchangeCount,
    extra,
    amount: exchangeCount * denom,
  };
}

export interface ExchangeInput {
  counts: Partial<Record<Denomination, unknown>>;
}

export function calculateAll(input: ExchangeInput): CalculationResult {
  const counts = input.counts ?? {};
  const lines = denominations.map((denom) =>
    calcDenomination(denom, sanitizeCount(counts[denom])),
  );
  const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0);
  const needsExchange = lines.some((l) => l.exchangeCount > 0);
  return { lines, totalAmount, needsExchange };
}
