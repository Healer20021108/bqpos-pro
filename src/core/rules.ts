// 固定面額與規則表。唯一需求來源為 PROJECT_SPEC.md，本檔只把規格數字落成常數。
// 若數字與 PROJECT_SPEC.md 衝突，一律以 PROJECT_SPEC.md 為準。

import type { Denomination, TodayMode } from './types';

export const denominations: Denomination[] = [500, 100, 50, 10, 5, 1];

// 500、100 以「張」計；50、10、5、1 以「個」計。
export function unitLabel(denom: Denomination): '張' | '個' {
  return denom === 500 || denom === 100 ? '張' : '個';
}

export interface PosRule {
  safe: number;
  recommended: number;
}

// POS 機軟規則：安全量 safe、建議量 recommended。
export const posRules: Record<'weekday' | 'weekend', Record<Denomination, PosRule>> = {
  weekday: {
    500: { safe: 5, recommended: 6 },
    100: { safe: 22, recommended: 25 },
    50: { safe: 5, recommended: 6 },
    10: { safe: 25, recommended: 30 },
    5: { safe: 12, recommended: 16 },
    1: { safe: 24, recommended: 30 },
  },
  weekend: {
    500: { safe: 6, recommended: 8 },
    100: { safe: 25, recommended: 30 },
    50: { safe: 6, recommended: 8 },
    10: { safe: 30, recommended: 40 },
    5: { safe: 16, recommended: 20 },
    1: { safe: 30, recommended: 40 },
  },
};

// 完整整理模式採用的 POS 目標規則表。
// 規格 9.3／13.3 未明指採平日或假日數字，這裡選用平日（標準日常配置）作為基準，
// 因為「完整整理」目的是回到日常標準，而非為高客流日預備。改這一個常數即可切換。
export const fullModeRuleSet: 'weekday' | 'weekend' = 'weekday';

// 預備金硬規則：補完 POS 後必須回到的固定數量。合計 10,000 元。
export const reserveTargets: Record<Denomination, number> = {
  500: 10,
  100: 25,
  50: 20,
  10: 100,
  5: 60,
  1: 200,
};

// 好換模式的進位單位（數量，不是金額）。
export const roundUnits: Record<Denomination, number> = {
  500: 2,
  100: 5,
  50: 10,
  10: 50,
  5: 20,
  1: 50,
};

// 取得指定今日模式對應的 POS 規則表。
export function ruleSetFor(mode: TodayMode): Record<Denomination, PosRule> {
  if (mode === 'weekend') return posRules.weekend;
  if (mode === 'full') return posRules[fullModeRuleSet];
  return posRules.weekday;
}
