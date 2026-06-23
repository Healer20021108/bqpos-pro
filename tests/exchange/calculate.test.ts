// 換錢核心演算法測試。執行：npm test （或 npm run test:watch）
import { test, expect } from 'vitest';

import {
  calcDenomination,
  calculateAll,
  sanitizeCount,
} from '../../src/modules/exchange/calculate';

test('sanitizeCount：空白／非法視為 0，小數捨去，負數歸零', () => {
  expect(sanitizeCount('')).toBe(0);
  expect(sanitizeCount(undefined)).toBe(0);
  expect(sanitizeCount('abc')).toBe(0);
  expect(sanitizeCount('-5')).toBe(0);
  expect(sanitizeCount('3.7')).toBe(3);
  expect(sanitizeCount(8)).toBe(8);
});

test('平日：POS 未低於安全量時不強制補', () => {
  // 100 元：安全量 22、建議量 25。目前 23（安全量與建議量之間）。
  const r = calcDenomination(100, { mode: 'weekday' }, 23, 25);
  expect(r.posTransfer).toBe(0);
  expect(r.externalNeed).toBe(0);
});

test('平日：POS 低於安全量時補到建議量，並反映預備金缺口（規格 12.x 範例）', () => {
  // 100 元：目前 21 < 安全量 22 → 補到建議量 25，需補 4；預備金 25（剛好硬標準）。
  const r = calcDenomination(100, { mode: 'weekday' }, 21, 25);
  expect(r.posTransfer).toBe(4);
  expect(r.actualTransferFromReserve).toBe(4);
  expect(r.reserveAfterTransfer).toBe(21);
  expect(r.reserveNeed).toBe(4);
  expect(r.externalNeed).toBe(4);
  expect(r.amount).toBe(400);
});

test('假日：POS 低於建議量就補到假日建議量', () => {
  // 100 元假日：安全量 25、建議量 30。目前 26（高於安全量但低於建議量）→ 仍要補到 30。
  const r = calcDenomination(100, { mode: 'weekend' }, 26, 25);
  expect(r.posTransfer).toBe(4);
  expect(r.posAfter).toBe(30);
});

test('完整整理：採平日規則表，低於建議量即補（與平日觸發點不同）', () => {
  // 目前 24：平日（安全量 22）不會補；完整整理（低於建議量 25）要補 1。
  const weekday = calcDenomination(100, { mode: 'weekday' }, 24, 25);
  expect(weekday.posTransfer).toBe(0);

  const full = calcDenomination(100, { mode: 'full' }, 24, 25);
  expect(full.posTransfer).toBe(1);
  expect(full.posAfter).toBe(25);
});

test('預備金不足以補 POS 時，缺口轉為外部直接補 POS', () => {
  // 500 元平日：目前 2 < 安全量 5 → 補到建議量 6，需補 4。
  // 預備金僅 1：只能補 1，POS 還差 3；預備金歸 0，硬標準 10 → 缺 10。
  const r = calcDenomination(500, { mode: 'weekday' }, 2, 1);
  expect(r.posTransfer).toBe(4);
  expect(r.actualTransferFromReserve).toBe(1);
  expect(r.posRemainingNeed).toBe(3);
  expect(r.reserveAfterTransfer).toBe(0);
  expect(r.reserveNeed).toBe(10);
  expect(r.externalNeed).toBe(13); // 10（預備金）＋ 3（POS 直接補）
});

test('計算順序正確：預備金有緩衝時，外部需求小於「POS 缺口＋預備金缺口」', () => {
  // 50 元平日：目前 3 < 安全量 5 → 補 3；預備金 25（硬標準 20，緩衝 5）。
  // 補 3 後預備金 22 仍 ≥ 20 → 外部需求應為 0。
  const r = calcDenomination(50, { mode: 'weekday' }, 3, 25);
  expect(r.posTransfer).toBe(3);
  expect(r.reserveAfterTransfer).toBe(22);
  expect(r.externalNeed).toBe(0);
  // 對照錯誤公式：POS 缺口(3) + 預備金缺口(0) = 3，會多換 3。
});

test('好換模式：依面額單位向上進位，並算出放回預備金的多出量', () => {
  // 100 元缺 4，進位單位 5 → 換 5，多出 1。
  const r = calcDenomination(100, { mode: 'weekday', exchangeMode: 'rounded' }, 21, 25);
  expect(r.externalNeed).toBe(4);
  expect(r.exchangeCount).toBe(5);
  expect(r.roundedExtra).toBe(1);
  expect(r.amount).toBe(500);
});

test('好換模式：無缺口時不進位、不產生多出', () => {
  const r = calcDenomination(100, { mode: 'weekday', exchangeMode: 'rounded' }, 25, 25);
  expect(r.externalNeed).toBe(0);
  expect(r.exchangeCount).toBe(0);
  expect(r.roundedExtra).toBe(0);
});

test('calculateAll：全部達標時不需換錢，總額為 0', () => {
  const atTarget = { 500: 6, 100: 25, 50: 6, 10: 30, 5: 16, 1: 30 } as const; // 平日建議量
  const reserveTarget = { 500: 10, 100: 25, 50: 20, 10: 100, 5: 60, 1: 200 } as const;
  const result = calculateAll({
    mode: 'weekday',
    exchangeMode: 'exact',
    pos: atTarget,
    reserve: reserveTarget,
  });
  expect(result.needsExchange).toBe(false);
  expect(result.externalAmount).toBe(0);
});

test('calculateAll：空白輸入視為 0，仍能算出預備金需補回硬標準', () => {
  const result = calculateAll({
    mode: 'weekday',
    exchangeMode: 'exact',
    pos: {}, // 全空 → 視為 0
    reserve: {}, // 全空 → 視為 0
  });
  expect(result.needsExchange).toBe(true);
  // 預備金全為 0，至少要補回硬標準 10,000 元（POS 直接補的部分另計，故為下限）。
  expect(result.externalAmount).toBeGreaterThanOrEqual(10000);
});
