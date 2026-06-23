// 換錢計算核心測試（簡化版：單一目標持有量）。執行：npm test
import { test, expect } from 'vitest';

import {
  calcDenomination,
  calculateAll,
  sanitizeCount,
} from '../../src/modules/exchange/calculate';

test('sanitizeCount：空白／非法／負數／小數一律視為無效 → 0；合法非負整數原樣保留', () => {
  expect(sanitizeCount('')).toBe(0);
  expect(sanitizeCount(undefined)).toBe(0);
  expect(sanitizeCount('abc')).toBe(0);
  expect(sanitizeCount('-5')).toBe(0);
  expect(sanitizeCount('3.7')).toBe(0);
  expect(sanitizeCount(3.7)).toBe(0);
  expect(sanitizeCount(0)).toBe(0);
  expect(sanitizeCount('25')).toBe(25);
});

test('目標 = 平日建議量 + 預備金硬標準（100 元應為 50）', () => {
  const r = calcDenomination(100, 20);
  expect(r.target).toBe(50);
  expect(r.exchangeCount).toBe(30); // 50 - 20
  expect(r.amount).toBe(3000); // 30 張 × 100
  expect(r.extra).toBe(0);
});

test('目前低於目標：要換 目標 − 目前', () => {
  const r = calcDenomination(500, 0); // 目標 16
  expect(r.exchangeCount).toBe(16);
  expect(r.amount).toBe(8000);
  expect(r.extra).toBe(0);
});

test('目前等於目標：不用換、也沒有多出', () => {
  const r = calcDenomination(10, 130); // 目標 130
  expect(r.exchangeCount).toBe(0);
  expect(r.amount).toBe(0);
  expect(r.extra).toBe(0);
});

test('目前高於目標：不用換，並算出多出的數量', () => {
  const r = calcDenomination(10, 145); // 目標 130
  expect(r.exchangeCount).toBe(0);
  expect(r.amount).toBe(0);
  expect(r.extra).toBe(15);
});

test('小數輸入視為無效（0），不會悄悄變成別的數量', () => {
  const r = calcDenomination(1, sanitizeCount('5.9')); // 5.9 → 0，目標 230
  expect(r.current).toBe(0);
  expect(r.exchangeCount).toBe(230);
});

test('calculateAll：全部達標時不需換錢，合計為 0', () => {
  const atTarget = { 500: 16, 100: 50, 50: 26, 10: 130, 5: 76, 1: 230 } as const;
  const result = calculateAll({ counts: atTarget });
  expect(result.needsExchange).toBe(false);
  expect(result.totalAmount).toBe(0);
});

test('calculateAll：全空（皆 0）時，需把每個幣值補到目標，合計 NT$16,210', () => {
  const result = calculateAll({ counts: {} });
  expect(result.needsExchange).toBe(true);
  expect(result.totalAmount).toBe(16210);
});

test('calculateAll：只有部分幣值不足時，只列出不足的', () => {
  const result = calculateAll({ counts: { 500: 16, 100: 50, 50: 26, 10: 120, 5: 76, 1: 230 } });
  const need = result.lines.filter((l) => l.exchangeCount > 0);
  expect(need.length).toBe(1);
  expect(need[0]?.denom).toBe(10);
  expect(need[0]?.exchangeCount).toBe(10); // 130 - 120
  expect(result.totalAmount).toBe(100); // 10 個 × 10
});
