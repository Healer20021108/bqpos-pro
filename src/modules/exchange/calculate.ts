// 換錢決策核心演算法（純函式，無 DOM、無副作用，可單獨測試）。
// 計算順序嚴格依照 PROJECT_SPEC.md 第 8、13 節：
//   1. 判斷 POS 是否需要補。
//   2. POS 需要補時，先從預備金「同面額」補。
//   3. 扣除預備金被拿去補 POS 的數量。
//   4. 重新檢查預備金是否低於硬規則。
//   5. 預備金最終不足的部分，才是外部換錢需求。
// 禁止使用「外部換錢 = POS 缺口 + 預備金缺口」這種錯誤公式。

import type { Denomination, TodayMode, ExchangeMode } from '../../core/types';
import {
  denominations,
  reserveTargets,
  roundUnits,
  unitLabel,
  ruleSetFor,
  type PosRule,
} from '../../core/rules';

/**
 * 將輸入值正規化為合法數量。
 * 規格（PROJECT_SPEC.md §14）：空白視為 0，且不允許負數與小數。
 * 因此空白／非數字／負數／小數一律視為無效，回傳 0（不做四捨五入或捨去，
 * 避免把 3.7 這種輸入錯誤悄悄變成一個看似合理的數量）。
 */
export function sanitizeCount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

/**
 * 計算 POS 需要從預備金補多少（補錢目標量）。
 * - 平日：低於安全量才補到建議量。
 * - 假日／完整整理：低於建議量就補到建議量。
 */
function posTransferFor(mode: TodayMode, rule: PosRule, posCurrent: number): number {
  if (mode === 'weekday') {
    return posCurrent < rule.safe ? rule.recommended - posCurrent : 0;
  }
  return posCurrent < rule.recommended ? rule.recommended - posCurrent : 0;
}

export interface DenominationResult {
  denom: Denomination;
  unit: '張' | '個';
  safe: number;
  recommended: number;
  posCurrent: number;
  /** POS 共需補的量。 */
  posTransfer: number;
  /** 補完後的 POS 數量。 */
  posAfter: number;
  /** 實際由預備金提供的量。 */
  actualTransferFromReserve: number;
  /** 預備金不夠，需外部直接補 POS 的量。 */
  posRemainingNeed: number;
  reserveCurrent: number;
  reserveTarget: number;
  /** 補 POS 後的預備金。 */
  reserveAfterTransfer: number;
  /** 預備金距硬規則的最終缺口。 */
  reserveNeed: number;
  /** 精準外部換錢需求。 */
  externalNeed: number;
  roundUnit: number;
  /** 建議換錢量（精準＝externalNeed；好換＝進位後）。 */
  exchangeCount: number;
  /** 好換進位後多出、放回預備金的量。 */
  roundedExtra: number;
  /** 該面額建議換錢金額。 */
  amount: number;
}

export interface CalcOptions {
  mode: TodayMode;
  exchangeMode?: ExchangeMode;
}

export function calcDenomination(
  denom: Denomination,
  options: CalcOptions,
  posCurrent: number,
  reserveCurrent: number,
): DenominationResult {
  const mode = options.mode;
  const exchangeMode = options.exchangeMode ?? 'exact';
  const rule = ruleSetFor(mode)[denom];
  const reserveTarget = reserveTargets[denom];

  // 1. POS 需補的目標量。
  const posTransfer = posTransferFor(mode, rule, posCurrent);

  // 2~3. 先從預備金同面額補並扣除；預備金不夠時，缺口轉為外部直接補 POS。
  const actualTransferFromReserve = Math.min(reserveCurrent, posTransfer);
  const posRemainingNeed = posTransfer - actualTransferFromReserve;
  const reserveAfterTransfer = reserveCurrent - actualTransferFromReserve;

  // 4~5. 預備金補完 POS 後是否低於硬規則；最終不足才列外部換錢。
  const reserveNeed = Math.max(0, reserveTarget - reserveAfterTransfer);
  const externalNeed = reserveNeed + posRemainingNeed;

  // 好換模式：依面額進位單位向上進位，多出的放回預備金。
  const roundUnit = roundUnits[denom];
  let exchangeCount = externalNeed;
  let roundedExtra = 0;
  if (exchangeMode === 'rounded' && externalNeed > 0) {
    exchangeCount = Math.ceil(externalNeed / roundUnit) * roundUnit;
    roundedExtra = exchangeCount - externalNeed;
  }

  return {
    denom,
    unit: unitLabel(denom),
    safe: rule.safe,
    recommended: rule.recommended,
    posCurrent,
    posTransfer,
    posAfter: posCurrent + posTransfer,
    actualTransferFromReserve,
    posRemainingNeed,
    reserveCurrent,
    reserveTarget,
    reserveAfterTransfer,
    reserveNeed,
    externalNeed,
    roundUnit,
    exchangeCount,
    roundedExtra,
    amount: exchangeCount * denom,
  };
}

export interface ExchangeInput {
  mode: TodayMode;
  exchangeMode?: ExchangeMode;
  pos: Partial<Record<Denomination, unknown>>;
  reserve: Partial<Record<Denomination, unknown>>;
}

export interface CalculationResult {
  mode: TodayMode;
  exchangeMode: ExchangeMode;
  lines: DenominationResult[];
  /** 建議實換金額（好換模式採進位後金額）。 */
  externalAmount: number;
  /** 精準缺口金額（不論模式，皆為真正缺口）。 */
  exactAmount: number;
  needsExchange: boolean;
}

export function calculateAll(input: ExchangeInput): CalculationResult {
  const mode = input.mode;
  const exchangeMode = input.exchangeMode ?? 'exact';
  const pos = input.pos ?? {};
  const reserve = input.reserve ?? {};

  const lines = denominations.map((denom) =>
    calcDenomination(
      denom,
      { mode, exchangeMode },
      sanitizeCount(pos[denom]),
      sanitizeCount(reserve[denom]),
    ),
  );

  const externalAmount = lines.reduce((sum, l) => sum + l.amount, 0);
  const exactAmount = lines.reduce((sum, l) => sum + l.externalNeed * l.denom, 0);
  const needsExchange = lines.some((l) => l.externalNeed > 0);

  return { mode, exchangeMode, lines, externalAmount, exactAmount, needsExchange };
}
