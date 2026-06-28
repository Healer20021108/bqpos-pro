// 固定面額與目標持有量。數字來源為 PROJECT_SPEC.md。
//
// 不分平日／假日。使用者可選目前統計的是「一盒＋POS」或「兩盒＋POS」。
// 預設一盒；兩盒採使用者指定的固定目標，不從一盒來源數字機械推算。

import type { Denomination } from './types';

export const denominations: Denomination[] = [500, 100, 50, 10, 5, 1];

export type ReserveBoxCount = 1 | 2;

// 500、100 以「張」計；50、10、5、1 以「個」計。
export function unitLabel(denom: Denomination): '張' | '個' {
  return denom === 500 || denom === 100 ? '張' : '個';
}

// 每個幣值該備到的總量 = 平日建議量 + 預備金硬標準。
// 註解標出兩者的相加來源，方便對照 PROJECT_SPEC.md。
export const stockTargets: Record<Denomination, number> = {
  500: 16, // 平日建議 6 + 預備金 10
  100: 50, // 25 + 25
  50: 27, // 7 + 20
  10: 130, // 30 + 100
  5: 76, // 16 + 60
  1: 230, // 30 + 200
};
// 合計：16×500 + 50×100 + 27×50 + 130×10 + 76×5 + 230×1 = NT$16,260。

export const twoBoxStockTargets: Record<Denomination, number> = {
  500: 26,
  100: 75,
  50: 46,
  10: 230,
  5: 136,
  1: 430,
};
// 合計：26×500 + 75×100 + 46×50 + 230×10 + 136×5 + 430×1 = NT$26,210。

export function getStockTargets(reserveBoxes: ReserveBoxCount = 1): Record<Denomination, number> {
  return reserveBoxes === 2 ? twoBoxStockTargets : stockTargets;
}
