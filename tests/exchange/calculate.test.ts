// 換錢計算核心測試（簡化版：單一目標持有量）。執行：npm test
import { test, expect } from 'vitest';

import {
  calcDenomination,
  calculateAll,
  goodExchange,
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

// ── 好換模式 ────────────────────────────────────────────────────────────

// 取某面額的好換結果。
function line(result: ReturnType<typeof goodExchange>, denom: number) {
  return result.lines.find((l) => l.denom === denom)!;
}

test('好換：沒有缺口時不換錢', () => {
  const atTarget = { 500: 16, 100: 50, 50: 26, 10: 130, 5: 76, 1: 230 } as const;
  const r = goodExchange({ counts: atTarget });
  expect(r.needsExchange).toBe(false);
  expect(r.total).toBe(0);
  expect(r.thousandNotes).toBe(0);
});

test('好換：完整走一遍（精準缺 143 → 銅板補5倍數 → 整百 → 整千 1000）', () => {
  // 目標 500:16 100:50 50:26 10:130 5:76 1:230
  // current 設計成精準缺口 = 50:1, 10:8, 5:2, 1:3（其餘達標），精準總額 143。
  const current = { 500: 16, 100: 50, 50: 25, 10: 122, 5: 74, 1: 227 };
  const r = goodExchange({ counts: current });

  expect(r.exactTotal).toBe(143);
  expect(r.total).toBe(1000);
  expect(r.thousandNotes).toBe(1);

  // 銅板補到 5 的倍數、整百，再用 500/100 補到整千。
  expect(line(r, 10).exchange).toBe(10); // 8 → 補到 10
  expect(line(r, 5).exchange).toBe(5); // 2 → 補到 5
  expect(line(r, 1).exchange).toBe(25); // 3 →(補5)→ 5，再由 1 元收尾到整百
  expect(line(r, 50).exchange).toBe(1); // 50 不參與銅板整理，維持精準
  expect(line(r, 500).exchange).toBe(1); // 補整千：800 = 1×500 + 3×100
  expect(line(r, 100).exchange).toBe(3);
});

test('好換不變量：總額必為 1000 的倍數、銅板皆為 5 的倍數、付款全用千元', () => {
  const samples = [
    { 500: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 }, // 全缺
    { 500: 16, 100: 50, 50: 25, 10: 122, 5: 74, 1: 227 },
    { 500: 10, 100: 30, 50: 20, 10: 100, 5: 60, 1: 200 },
    { 500: 16, 100: 49, 50: 26, 10: 128, 5: 71, 1: 229 },
  ];
  for (const counts of samples) {
    const r = goodExchange({ counts });
    expect(r.total % 1000).toBe(0); // 整千
    expect(r.thousandNotes * 1000).toBe(r.total); // 付款全用千元鈔
    expect(r.total).toBeGreaterThanOrEqual(r.exactTotal); // 多換不少換
    for (const d of [10, 5, 1]) {
      expect(line(r, d).exchange % 5).toBe(0); // 銅板皆 5 的倍數
    }
  }
});

test('好換：每個面額的好換數量都 ≥ 精準數量（不會少換）', () => {
  const r = goodExchange({ counts: { 500: 16, 100: 50, 50: 25, 10: 122, 5: 74, 1: 227 } });
  for (const l of r.lines) {
    expect(l.exchange).toBeGreaterThanOrEqual(l.exact);
    expect(l.extra).toBe(l.exchange - l.exact);
  }
});
