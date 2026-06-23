// 固定面額與目標持有量。數字來源為 PROJECT_SPEC.md。
//
// 簡化版需求（使用者 2026-06-24 決定）：不分平日/假日、不分 POS 與預備金，
// 只用「單一目標持有量」。目標 = 平日 POS 建議量 + 預備金硬標準。

import type { Denomination } from './types';

export const denominations: Denomination[] = [500, 100, 50, 10, 5, 1];

// 500、100 以「張」計；50、10、5、1 以「個」計。
export function unitLabel(denom: Denomination): '張' | '個' {
  return denom === 500 || denom === 100 ? '張' : '個';
}

// 每個幣值該備到的總量 = 平日建議量 + 預備金硬標準。
// 註解標出兩者的相加來源，方便對照 PROJECT_SPEC.md。
export const stockTargets: Record<Denomination, number> = {
  500: 16, // 平日建議 6 + 預備金 10
  100: 50, // 25 + 25
  50: 26, // 6 + 20
  10: 130, // 30 + 100
  5: 76, // 16 + 60
  1: 230, // 30 + 200
};
// 合計：16×500 + 50×100 + 26×50 + 130×10 + 76×5 + 230×1 = NT$16,210。
