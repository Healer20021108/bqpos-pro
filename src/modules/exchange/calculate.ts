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

// ── 好換模式 ────────────────────────────────────────────────────────────
// 在精準需求之上做「好換」加工，原則：多換不要少換。
//   1. 銅板 10/5/1 先各自補到「數量為 5 的倍數」（方便整捆點數）。
//   2. 再 round-robin（10→5→1）每種補一整捆 5 個，把總額補到整百；
//      放不下的整捆就跳過，由更小面額（1 元每捆 5 元）收尾，剛好落在整百。
//   3. 最後用 $500／$100 鈔票把總額補到「整千」，這樣付錢時全部用千元鈔，
//      $500／$100 不會被動到（不缺、也不用回補）。
// 付款 = 總額 ÷ 1000 張千元鈔。

const coinOrder: Denomination[] = [10, 5, 1];

export interface GoodExchangeLine {
  denom: Denomination;
  unit: '張' | '個';
  /** 精準缺口數量。 */
  exact: number;
  /** 好換後實際要換的數量。 */
  exchange: number;
  /** 比精準多換的數量（湊整用，留抽屜備用）。 */
  extra: number;
  /** 該面額好換要換的金額。 */
  amount: number;
}

export interface GoodExchangeResult {
  lines: GoodExchangeLine[];
  /** 精準缺口總額。 */
  exactTotal: number;
  /** 好換後總額（必為 1000 的倍數）。 */
  total: number;
  /** 付款用的千元鈔張數（= total / 1000）。 */
  thousandNotes: number;
  needsExchange: boolean;
}

export function goodExchange(input: ExchangeInput): GoodExchangeResult {
  const base = calculateAll(input);

  const exact: Record<Denomination, number> = { 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 };
  const exch: Record<Denomination, number> = { 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 };
  for (const l of base.lines) {
    exact[l.denom] = l.exchangeCount;
    exch[l.denom] = l.exchangeCount;
  }
  const exactTotal = base.totalAmount;

  const sum = (): number => denominations.reduce((s, d) => s + exch[d] * d, 0);

  if (exactTotal === 0) {
    const lines = denominations.map((d) => ({
      denom: d,
      unit: unitLabel(d),
      exact: 0,
      exchange: 0,
      extra: 0,
      amount: 0,
    }));
    return { lines, exactTotal: 0, total: 0, thousandNotes: 0, needsExchange: false };
  }

  // 1. 銅板各自補到 5 的倍數（無條件，已是倍數則不動）。
  for (const d of coinOrder) {
    exch[d] = Math.ceil(exch[d] / 5) * 5;
  }

  // 2. 補到整百：round-robin 每種補一整捆（5 個），放不下就跳過，1 元收尾。
  //    補完銅板後總額對 100 的餘數必為 5 的倍數，故必能由 1 元（每捆 5 元）剛好補滿。
  let toHundred = (100 - (sum() % 100)) % 100;
  while (toHundred > 0) {
    let progressed = false;
    for (const d of coinOrder) {
      const cost = 5 * d;
      if (cost <= toHundred) {
        exch[d] += 5;
        toHundred -= cost;
        progressed = true;
      }
    }
    if (!progressed) break; // 安全網（理論上不會發生）
  }

  // 3. 補到整千：用 $500／$100 鈔票（先 500 後 100）。
  let toThousand = (1000 - (sum() % 1000)) % 1000;
  const n500 = Math.floor(toThousand / 500);
  exch[500] += n500;
  toThousand -= n500 * 500;
  exch[100] += toThousand / 100;

  const total = sum();
  const lines = denominations.map((d) => ({
    denom: d,
    unit: unitLabel(d),
    exact: exact[d],
    exchange: exch[d],
    extra: exch[d] - exact[d],
    amount: exch[d] * d,
  }));

  return { lines, exactTotal, total, thousandNotes: total / 1000, needsExchange: true };
}
